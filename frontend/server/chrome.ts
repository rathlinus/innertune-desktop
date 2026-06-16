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

// Where captured creds live. YTM_DATA lets the Electron app redirect this to a
// writable per-user dir (app.getPath("userData")); dev/CLI default to ./data.
// Resolved lazily so the env var can be set before the first call.
const dataDir = () => process.env.YTM_DATA || path.join(process.cwd(), "data");
const profileDir = () => path.join(dataDir(), "chrome-profile");
const sessionFile = () => path.join(dataDir(), "session.json");
const cookiesTxt = () => path.join(dataDir(), "cookies.txt");

const DEBUG_PORT = 9222;
const CAPTURE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min to finish logging in
const POLL_INTERVAL_MS = 2000;

// The cookie that only exists once you're actually signed in. Its presence is
// our "login complete" signal.
const AUTH_COOKIE = "SAPISID";

// Where Chrome/Chromium typically lives, per OS. `CHROME_PATH` (honoured first)
// lets the user point at a non-standard install — handy for the packaged Linux
// binary running on distros that put the browser somewhere unusual.
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH || "",
  // Windows
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(
    process.env.LOCALAPPDATA || "",
    "Google/Chrome/Application/chrome.exe"
  ),
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
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
    if (existsSync(sessionFile())) {
      // The file may be empty (logout() truncates it to "") or partially
      // written (an interrupted capture). Treat any non-JSON content as
      // "logged out" rather than throwing SyntaxError up through every API call.
      try {
        const raw = readFileSync(sessionFile(), "utf8").trim();
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
  return existsSync(cookiesTxt()) ? cookiesTxt() : null;
}

export function logout(): void {
  cached = null;
  for (const f of [sessionFile(), cookiesTxt()]) {
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
  loggedIn: boolean;
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
    loggedIn: false,
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
            loggedIn: g('LOGGED_IN') === true,
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
  if (!found)
    throw new Error(
      "Could not find Chrome/Chromium. Install it or set CHROME_PATH."
    );
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

  mkdirSync(profileDir(), { recursive: true });
  loginState = { status: "waiting" };

  const proc = spawn(
    chromePath(),
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profileDir()}`,
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
        // The SAPISID cookie is set on .google.com mid-login, *before* the
        // browser lands back on music.youtube.com and the web client reboots as
        // authenticated. Capturing on the bare cookie races that redirect and
        // yields a partial session — most importantly a missing/stale
        // visitor_data, which leaves audio bot-walled (see callPlayer). That's
        // why the first login attempt used to need a second click. So we wait
        // until the live music client reports it's actually logged in and
        // exposes its blessed visitorData before capturing.
        const cfg = await getYtcfg();
        if (cfg.loggedIn && cfg.visitorData) {
          await capture(cookies, cfg);
          loginState = { status: "captured" };
          return;
        }
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

async function capture(cookies: CdpCookie[], cfg: Ytcfg): Promise<void> {
  mkdirSync(dataDir(), { recursive: true });
  const session: Session = {
    cookie: toCookieHeader(cookies),
    visitor_data: cfg.visitorData,
    apiKey: cfg.apiKey,
    clientVersion: cfg.clientVersion,
    context: cfg.context,
    capturedAt: Date.now(),
  };
  writeFileSync(sessionFile(), JSON.stringify(session, null, 2));
  writeFileSync(cookiesTxt(), toNetscape(cookies));
  cached = session; // invalidate the read-through cache with fresh creds
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
