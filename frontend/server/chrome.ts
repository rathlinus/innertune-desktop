// Controlled-Chrome session capture.
//
// We launch the user's real Chrome with a dedicated profile and the remote
// debugging port open, let them log into music.youtube.com interactively
// (Google login + 2FA can't be automated, and shouldn't be), then attach over
// the Chrome DevTools Protocol to pull exactly what the YouTube Music web
// client uses to authenticate itself:
//
//   - the full cookie jar  -> Innertube `cookie` + a Netscape cookies.txt for yt-dlp
//   - VISITOR_DATA         -> Innertube `visitor_data` (from window.ytcfg)
//
// Those two are enough for authenticated browse/library/lyrics calls and for
// yt-dlp to fetch premium-quality streams as the logged-in user. No Playwright,
// no Python: Node 22 ships a global WebSocket and fetch, which is all CDP needs.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const PROFILE_DIR = path.join(DATA_DIR, "chrome-profile");
const SESSION_FILE = path.join(DATA_DIR, "session.json");
const COOKIES_TXT = path.join(DATA_DIR, "cookies.txt");

const DEBUG_PORT = 9222;
const CAPTURE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min to finish logging in
const POLL_INTERVAL_MS = 2000;

// The cookie that only exists once you're actually signed in. Its presence is
// our "login complete" signal.
const AUTH_COOKIE = "SAPISID";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(
    process.env.LOCALAPPDATA || "",
    "Google/Chrome/Application/chrome.exe"
  ),
];

export interface Session {
  cookie: string; // "NAME=value; NAME2=value2; ..." -> Cookie header
  visitor_data: string | null; // -> X-Goog-Visitor-Id
  apiKey: string | null; // INNERTUBE_API_KEY -> ?key=
  clientVersion: string | null; // WEB_REMIX client version
  context: unknown | null; // INNERTUBE_CONTEXT (client locale etc.)
  capturedAt: number;
}

interface CdpCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number; // unix seconds, -1 = session cookie
  secure: boolean;
  httpOnly: boolean;
}

// ---- session persistence ----------------------------------------------------

let cached: Session | null | undefined;

export function getSession(): Session | null {
  if (cached === undefined) {
    cached = null;
    if (existsSync(SESSION_FILE)) {
      // The file may be empty (logout() truncates it to "") or partially
      // written (an interrupted capture). Treat any non-JSON content as
      // "logged out" rather than throwing SyntaxError up through every API call.
      try {
        const raw = readFileSync(SESSION_FILE, "utf8").trim();
        if (raw) cached = JSON.parse(raw) as Session;
      } catch {
        cached = null;
      }
    }
  }
  return cached;
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

export function cookiesTxtPath(): string | null {
  return existsSync(COOKIES_TXT) ? COOKIES_TXT : null;
}

export function logout(): void {
  cached = null;
  for (const f of [SESSION_FILE, COOKIES_TXT]) {
    try {
      if (existsSync(f)) writeFileSync(f, "");
    } catch {
      /* ignore */
    }
  }
}

// ---- CDP plumbing ------------------------------------------------------------

interface Target {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

async function cdpTargets(): Promise<Target[]> {
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
  return (await res.json()) as Target[];
}

async function cdpBrowserWs(): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  const v = (await res.json()) as { webSocketDebuggerUrl: string };
  return v.webSocketDebuggerUrl;
}

// One request/response round-trip over a CDP websocket. Opens, sends a single
// command, resolves with the result, closes. Simple and stateless — capture is
// infrequent so we don't need a persistent multiplexed connection.
function cdpCall<T = any>(
  wsUrl: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error(`CDP ${method} timed out`));
    }, 10_000);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id !== id) return;
      clearTimeout(timer);
      ws.close();
      if (msg.error) reject(new Error(`CDP ${method}: ${msg.error.message}`));
      else resolve(msg.result as T);
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`CDP socket error for ${method}`));
    });
  });
}

async function getAllCookies(): Promise<CdpCookie[]> {
  const browserWs = await cdpBrowserWs();
  const { cookies } = await cdpCall<{ cookies: CdpCookie[] }>(
    browserWs,
    "Storage.getCookies"
  );
  return cookies ?? [];
}

interface Ytcfg {
  visitorData: string | null;
  apiKey: string | null;
  clientVersion: string | null;
  context: unknown | null;
}

// Pull the InnerTube config the live web client uses — API key, client
// version, visitor data, and the full context object — straight out of its
// `ytcfg`. This is what lets us replicate its youtubei/v1 requests verbatim.
async function getYtcfg(): Promise<Ytcfg> {
  const empty: Ytcfg = {
    visitorData: null,
    apiKey: null,
    clientVersion: null,
    context: null,
  };
  const targets = await cdpTargets();
  const page = targets.find(
    (t) => t.type === "page" && t.url.includes("music.youtube.com")
  );
  if (!page) return empty;
  try {
    const { result } = await cdpCall<{ result: { value?: string } }>(
      page.webSocketDebuggerUrl,
      "Runtime.evaluate",
      {
        expression: `JSON.stringify((function () {
          var g = (window.ytcfg && ytcfg.get) ? ytcfg.get.bind(ytcfg) : function () { return undefined; };
          var ctx = g('INNERTUBE_CONTEXT') || null;
          return {
            visitorData: g('VISITOR_DATA') || (ctx && ctx.client && ctx.client.visitorData) || null,
            apiKey: g('INNERTUBE_API_KEY') || null,
            clientVersion: g('INNERTUBE_CLIENT_VERSION') || (ctx && ctx.client && ctx.client.clientVersion) || null,
            context: ctx,
          };
        })())`,
        returnByValue: true,
      }
    );
    return result?.value ? (JSON.parse(result.value) as Ytcfg) : empty;
  } catch {
    return empty;
  }
}

// ---- cookie formatting -------------------------------------------------------

function toCookieHeader(cookies: CdpCookie[]): string {
  // De-dupe by name (prefer the most specific google domain) and join.
  const byName = new Map<string, string>();
  for (const c of cookies) {
    if (c.domain.includes("google") || c.domain.includes("youtube")) {
      byName.set(c.name, c.value);
    }
  }
  return [...byName].map(([k, v]) => `${k}=${v}`).join("; ");
}

// Netscape cookies.txt for yt-dlp's --cookies flag.
function toNetscape(cookies: CdpCookie[]): string {
  const lines = ["# Netscape HTTP Cookie File", "# generated by ytmusicnative"];
  for (const c of cookies) {
    if (!c.domain.includes("youtube") && !c.domain.includes("google")) continue;
    const domain = c.domain.startsWith(".") ? c.domain : `.${c.domain}`;
    const includeSub = "TRUE";
    const expires = c.expires > 0 ? Math.floor(c.expires) : 0;
    lines.push(
      [
        domain,
        includeSub,
        c.path || "/",
        c.secure ? "TRUE" : "FALSE",
        String(expires),
        c.name,
        c.value,
      ].join("\t")
    );
  }
  return lines.join("\n") + "\n";
}

// ---- launch + capture --------------------------------------------------------

function chromePath(): string {
  const found = CHROME_CANDIDATES.find((p) => p && existsSync(p));
  if (!found) throw new Error("Could not find chrome.exe in the usual places");
  return found;
}

type LoginState =
  | { status: "idle" }
  | { status: "waiting" }
  | { status: "captured" }
  | { status: "error"; message: string };

let loginState: LoginState = { status: "idle" };

export function getLoginState(): LoginState {
  return loginState;
}

// Launch Chrome (if not already up) and start watching for a completed login.
// Returns immediately; the frontend polls /auth/status to see when capture
// lands. Safe to call again — it no-ops while a capture is already in flight.
export function startLogin(): LoginState {
  if (loginState.status === "waiting") return loginState;

  mkdirSync(PROFILE_DIR, { recursive: true });
  loginState = { status: "waiting" };

  const proc = spawn(
    chromePath(),
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--new-window",
      "https://music.youtube.com/",
    ],
    { detached: true, stdio: "ignore" }
  );
  proc.unref();

  void watchForLogin();
  return loginState;
}

async function watchForLogin(): Promise<void> {
  const deadline = Date.now() + CAPTURE_TIMEOUT_MS;

  // Give Chrome a beat to open the debug port.
  await delay(1500);

  while (Date.now() < deadline) {
    try {
      const cookies = await getAllCookies();
      const signedIn = cookies.some((c) => c.name === AUTH_COOKIE && c.value);
      if (signedIn) {
        await capture(cookies);
        loginState = { status: "captured" };
        return;
      }
    } catch {
      // Port not ready yet, or Chrome was closed — keep trying until deadline.
    }
    await delay(POLL_INTERVAL_MS);
  }

  loginState = {
    status: "error",
    message: "Timed out waiting for login. Close Chrome and try again.",
  };
}

async function capture(cookies: CdpCookie[]): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  const cfg = await getYtcfg();
  const session: Session = {
    cookie: toCookieHeader(cookies),
    visitor_data: cfg.visitorData,
    apiKey: cfg.apiKey,
    clientVersion: cfg.clientVersion,
    context: cfg.context,
    capturedAt: Date.now(),
  };
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
  writeFileSync(COOKIES_TXT, toNetscape(cookies));
  cached = session; // invalidate the read-through cache with fresh creds
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
