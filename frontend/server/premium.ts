// Premium high-quality audio (itag 141 / 774 — ~256 kbps AAC).
//
// The anonymous ANDROID_VR path (innertube.ts `resolveAudio`) tops out around
// itag 251 / 140 (~150 kbps). The premium formats are only returned by the
// authenticated WEB_REMIX *web* player, and — unlike ANDROID_VR — they come
// with a `signatureCipher` that must be descrambled by replaying the player's
// own cipher functions. We do that here, in pure Node, with no yt-dlp and no JS
// challenge solver: the whole base.js is run in a vm sandbox behind an
// "eval-portal" so its in-closure cipher functions can be invoked by name.
//
// Ported from the verified _probe/itag141.mjs research script. See
// reverseengeneer.md §8.1. NOTE: itag 141 is only present for Premium accounts;
// callers must fall back to resolveAudio when this throws.

import { createHash } from "node:crypto";
import { createContext, runInContext } from "node:vm";
import { getSession } from "./chrome";
import type { AudioFormat, StreamInfo } from "./innertube";

const MUSIC_ORIGIN = "https://music.youtube.com";
const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
// Premium-only audio itags, best first.
const PREMIUM_ITAGS = [141, 774];

interface Portal {
  ev: (expr: string) => any;
  // Like `ev`, but runs inside a fresh `runInContext` so V8's watchdog can abort
  // a candidate that infinite-loops or blows the stack (returns undefined then).
  // Essential for the behavioral n-driver search, which probes thousands of the
  // player's own functions — some of which never return when called out of band.
  evT: (expr: string, ms?: number) => any;
  ARR: string | null;
}

interface PlayerAssets {
  playerId: string;
  baseJs: string;
  sts: number;
  clientVersion: string;
  portal: Portal;
  // The player's media-URL decorator function name (found once via the
  // `("alr","yes")` fingerprint); null when this player has no such function.
  decorator?: string | null;
  // Whether driving that decorator produced a googlevideo-verified URL. Cached so
  // we verify once per player build, then trust it (true) or fall straight through
  // to the static-descramble fallback (false).
  decoratorOk?: boolean;
}

// base.js rotates (a few times a day) and building the eval-portal is the
// expensive part, so cache the whole bundle for a while.
let assetsCache: { assets: PlayerAssets; expires: number } | null = null;
const ASSETS_TTL_MS = 30 * 60 * 1000;

// The raw player response is reused by both the stream resolver and the
// "Audioqualität" tab; cache it briefly to avoid a double round-trip.
const playerCache = new Map<string, { player: any; expires: number }>();
const PLAYER_TTL_MS = 2 * 60 * 1000;

function sapisidAuth(cookie: string): string {
  const sap = cookie.match(
    /(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID|__Secure-1PAPISID)=([^;]+)/
  )?.[1];
  if (!sap) throw new Error("no SAPISID cookie");
  const ts = Math.floor(Date.now() / 1000);
  const hash = createHash("sha1").update(`${ts} ${sap} ${MUSIC_ORIGIN}`).digest("hex");
  return `SAPISIDHASH ${ts}_${hash}`;
}

// ---- eval-portal -----------------------------------------------------------

function matchBrace(s: string, open: number): number {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") d++;
    else if (s[i] === "}" && !--d) return i + 1;
  }
  return -1;
}

// Run the whole base.js in a vm and expose an in-closure `eval` (`__ev`) so the
// player's own cipher functions can be invoked by name. We inject it right after
// the reverse/swap/splice helper object that exists in every player family. The
// swap regex accepts both the index-aliased length (`a[b%a[r[8]]]`) and the
// plain `a[b%a.length]` form; for the aliased form it also captures the
// string-alias array name (`ARR`), which the live n-driver needs.
function makePortal(baseJs: string): Portal {
  const swap = baseJs.match(
    /[A-Za-z0-9$_]+:function\(([A-Za-z0-9$_]+),([A-Za-z0-9$_]+)\)\{var [A-Za-z0-9$_]+=\1\[0\];\1\[0\]=\1\[\2%\1(?:\.length|\[([A-Za-z0-9$_]+)\[\d+\]\])\]/
  );
  if (!swap) throw new Error("swap helper not found (player structure changed)");
  const ARR = swap[3] || null;
  const objHead = [
    ...baseJs.slice(0, baseJs.indexOf(swap[0])).matchAll(/([A-Za-z0-9$_]+)=\{/g),
  ].pop();
  if (!objHead) throw new Error("helper object not found");
  const objEnd = matchBrace(baseJs, baseJs.indexOf("{", objHead.index));
  const src =
    baseJs.slice(0, objEnd) +
    ";globalThis.__ev=function(_x){try{return eval(_x)}catch(e){return undefined}};" +
    baseJs.slice(objEnd);

  const makeStub = () => {
    const f = () => stub;
    const stub: any = new Proxy(f, {
      get: (_, p) =>
        p === "length"
          ? 0
          : p === "toString" || p === Symbol.toPrimitive
            ? () => ""
            : stub,
      set: () => true,
      apply: () => stub,
      construct: () => stub,
      has: () => true,
    });
    return stub;
  };

  const ctx: any = {
    navigator: {
      userAgent: WEB_UA,
      platform: "Win32",
      languages: ["en"],
      language: "en",
    },
    location: {
      href: MUSIC_ORIGIN + "/",
      protocol: "https:",
      hostname: "music.youtube.com",
      origin: MUSIC_ORIGIN,
      search: "",
      hash: "",
      pathname: "/",
    },
    document: makeStub(),
    XMLHttpRequest: function () {
      return makeStub();
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    Math,
    Date,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    escape,
    unescape,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Symbol,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Function,
    Reflect,
    Proxy,
    Uint8Array,
    Uint32Array,
    Int32Array,
    ArrayBuffer,
    DataView,
    Float64Array,
    btoa: (x: string) => Buffer.from(x, "binary").toString("base64"),
    atob: (x: string) => Buffer.from(x, "base64").toString("binary"),
    performance: { now: () => Date.now() },
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.top = ctx;
  createContext(ctx);
  runInContext(src, ctx, { timeout: 10000 });
  if (typeof ctx.__ev !== "function") throw new Error("eval-portal did not initialise");
  // Timeout-guarded variant: route the in-closure __ev through runInContext so a
  // runaway candidate is aborted by V8's watchdog instead of hanging the process.
  const evT = (expr: string, ms = 150): any => {
    try {
      runInContext(`globalThis.__r=__ev(${JSON.stringify(expr)})`, ctx, { timeout: ms });
      return ctx.__r;
    } catch {
      return undefined;
    }
  };
  return { ev: ctx.__ev, evT, ARR };
}

// ---- signature / n descrambling -------------------------------------------

const valid = (x: any, ref: string) =>
  typeof x === "string" && x.length >= 8 && x !== ref && /^[A-Za-z0-9_-]+$/.test(x);

// A correctly descrambled `n` is a genuine scramble of the input: similar length
// and — crucially — it does NOT contain the untransformed input verbatim. When a
// candidate isn't really the n-driver (wrong function, or the right function
// invoked with the wrong calling convention), its guard/catch branch typically
// returns `<prefix>+input` (e.g. an undefined module var stringified to
// "undefined" + the original n). Such a value still passes `valid()` (it's all
// URL-safe chars) and can win a majority vote, yielding a dead URL googlevideo
// 403s. Rejecting any output that embeds the raw input — and bounding the length
// — filters that out so the caller falls back instead of streaming garbage.
const validN = (x: any, ref: string): x is string =>
  valid(x, ref) && !x.includes(ref) && x.length <= ref.length + 12;

// A descrambled signature is a reorder of the input chars with a few spliced
// off, i.e. a sub-multiset of the input. Charset-agnostic.
function isReorderOf(x: any, ref: string): boolean {
  if (typeof x !== "string" || x.length < 8 || x === ref || x.length > ref.length)
    return false;
  const cnt: Record<string, number> = {};
  for (const c of ref) cnt[c] = (cnt[c] || 0) + 1;
  for (const c of x) {
    if (!cnt[c]) return false;
    cnt[c]--;
  }
  return x.length >= ref.length - 30;
}

// Descramble a signatureCipher `s` (and optional `n`) by replaying the player's
// own cipher functions through the portal. Tries the current music-player family
// first, then falls back to the classic single-arg-decipher family. Throws
// (loud, never silently wrong) if no strategy matches.
function descramble(
  baseJs: string,
  portal: Portal,
  sIn: string,
  nIn: string | null
): { sig: string; n: string | null } {
  const { ev, ARR } = portal;

  // ---------- signature ----------
  let sig: string | null = null;
  let sigFn: string | null = null;
  // (A) live/nested-int form: SIGFN(a,b,ECFN(c,d,X.s))
  const sc = baseJs.match(
    /([A-Za-z0-9$_]+)\((\d+),(\d+),([A-Za-z0-9$_]+)\((\d+),(\d+),[A-Za-z0-9$_.]+\.s\)\)/
  );
  if (sc) {
    const [, S, A, B, E, C, D] = sc;
    const r = ev(`${S}(${A},${B},${E}(${C},${D},${JSON.stringify(sIn)}))`);
    if (typeof r === "string" && r.length >= 10) sig = r;
  }
  // (B) classic single-arg decipher FN(s).
  if (!sig) {
    const cand = new Set<string>();
    for (const m of baseJs.matchAll(/([A-Za-z0-9$_]+)\(decodeURIComponent\(/g))
      cand.add(m[1]);
    for (const m of baseJs.matchAll(
      /([A-Za-z0-9$_]+)=function\(\w\)\{\w=\w(?:\.split\(""\)|\[[A-Za-z0-9$_]+\[\d+\]\]\([A-Za-z0-9$_]+\[\d+\]\))/g
    ))
      cand.add(m[1]);
    for (const fn of cand) {
      const r = ev(`${fn}(${JSON.stringify(sIn)})`);
      if (isReorderOf(r, sIn)) {
        sig = r;
        sigFn = fn;
        break;
      }
    }
  }
  if (!sig) throw new Error("signature: no strategy matched (player structure changed)");

  // ---------- n-challenge ----------
  let nOut: string | null = null;
  if (nIn) {
    // (A) live n-driver: brute the small XOR-masked index space, rank by frequency.
    const nMatch = ARR
      ? baseJs.match(
          new RegExp(
            "z\\[" +
              ARR +
              "\\[([A-Za-z0-9$_]+)\\^(\\d+)\\]\\]\\(" +
              ARR +
              "\\[\\1\\^\\d+\\]\\)\\s*[,;]\\s*(?:var\\s+)?[A-Za-z0-9$_]+=\\["
          )
        )
      : null;
    if (nMatch) {
      const splitOff = Number(nMatch[2]);
      const fn = [
        ...baseJs.slice(0, nMatch.index).matchAll(/([A-Za-z0-9$_]+)=function\(/g),
      ].pop();
      const nDriver = fn ? fn[1] : null;
      const splitIdx = ev(`${ARR}.indexOf("split")`);
      if (nDriver && typeof splitIdx === "number" && splitIdx >= 0) {
        const Q = splitIdx ^ splitOff;
        const counts: Record<string, number> = {};
        for (let M = 0; M < 64; M++) {
          const r = ev(`${nDriver}(${M},${Q ^ M},${JSON.stringify(nIn)})`);
          if (validN(r, nIn)) counts[r] = (counts[r] || 0) + 1;
        }
        const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (ranked.length) nOut = ranked[0][0];
      }
    }
    // (A2) array-challenge n-driver (current "live" player family, e.g. player
    // 1cf32b49). The driver is the function whose body builds a *self-referencing*
    // opcode array (`w[V^k]=w`); the access immediately before that array splits
    // the input string, so its XOR offset yields Q = ARR.indexOf("split") ^ off.
    // Scanning driver(M, Q^M, n) over M, every M that reaches the array-challenge
    // branch produces the same (correct) n — so the majority output wins. Iterate
    // all self-ref arrays (dedup by driver fn) so a stray match can't shadow the
    // real driver.
    if (!nOut && ARR) {
      const splitIdx = ev(`${ARR}.indexOf("split")`);
      const splitRe = new RegExp(
        "[A-Za-z0-9$_]+\\[" +
          ARR +
          "\\[([A-Za-z0-9$_]+)\\^(\\d+)\\]\\]\\(" +
          ARR +
          "\\[([A-Za-z0-9$_]+)\\^(\\d+)\\]\\)",
        "g"
      );
      const tried = new Set<string>();
      for (const selfRef of baseJs.matchAll(
        /([A-Za-z0-9$_]+)\[[A-Za-z0-9$_]+\^\d+\]=\1[,;]/g
      )) {
        if (nOut || typeof splitIdx !== "number" || splitIdx < 0) break;
        const fnDef = [
          ...baseJs.slice(0, selfRef.index!).matchAll(/([A-Za-z0-9$_]+)=function\(/g),
        ].pop();
        if (!fnDef || tried.has(fnDef[1])) continue;
        // The split access that seeds the challenge sits just before the opcode
        // array literal, which can be ~1KB long — so look back far enough to clear
        // it and take the *nearest* access (the last match) to stay in this branch.
        const win = baseJs.slice(Math.max(0, selfRef.index! - 2000), selfRef.index!);
        const accs = [...win.matchAll(splitRe)].filter((m) => m[1] === m[3]);
        if (!accs.length) continue;
        tried.add(fnDef[1]);
        const fn = fnDef[1];
        const Q = splitIdx ^ Number(accs[accs.length - 1][2]);
        const counts: Record<string, number> = {};
        for (let M = 0; M < 256; M++) {
          const r = ev(`${fn}(${M},${Q ^ M},${JSON.stringify(nIn)})`);
          if (validN(r, nIn)) counts[r] = (counts[r] || 0) + 1;
        }
        const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        // require a real majority (>=3 agreeing M) so a single spurious hit can't win.
        if (ranked.length && ranked[0][1] >= 3) nOut = ranked[0][0];
      }
    }
    // (B) classic n: anchor on the actual n-application site.
    if (!nOut) {
      const cand = new Map<string, boolean>(); // fn -> wrapInDecode
      const nearestBefore = (v: string, end: number) => {
        const w = baseJs.slice(Math.max(0, end - 140), end);
        for (const [re, dec] of [
          [`${v}=([A-Za-z0-9$_]+(?:\\[\\d+\\])?)\\(${v}[,)]`, false],
          [`${v}=([A-Za-z0-9$_]+(?:\\[\\d+\\])?)\\(decodeURIComponent\\(${v}\\)`, true],
        ] as const) {
          const all = [...w.matchAll(new RegExp(re, "g"))];
          if (all.length) {
            const fn = all[all.length - 1][1];
            if (fn !== sigFn) cand.set(fn, dec);
          }
        }
      };
      // literal: X.set("n", VAR)
      for (const m of baseJs.matchAll(/\.set\(\s*"n"\s*,\s*(\w+)\s*\)/g))
        nearestBefore(m[1], m.index!);
      // aliased: [A[i]](A[j], VAR) with A[j]==="n", A[i]==="set"
      for (const m of baseJs.matchAll(
        /\[([A-Za-z0-9$_]+)\[(\d+)\]\]\(\1\[(\d+)\],\s*(\w+)\)/g
      )) {
        const [, A, i, j, v] = m;
        if (ev(`${A}[${j}]`) === "n" && ev(`${A}[${i}]`) === "set")
          nearestBefore(v, m.index!);
      }
      const probe = nIn.length > 1 ? nIn.slice(1) + nIn[0] : nIn + "A";
      for (const [fn, dec] of cand) {
        const call = (v: string) =>
          ev(`${fn}(${dec ? `decodeURIComponent(${JSON.stringify(v)})` : JSON.stringify(v)})`);
        const r = call(nIn);
        if (validN(r, nIn) && call(probe) !== r) {
          nOut = r;
          break;
        }
      }
    }
    if (!nOut)
      throw new Error("n-challenge: no strategy matched (player structure changed)");
  }
  return { sig, n: nOut };
}

// ---- player assets + call --------------------------------------------------

async function fetchAssets(): Promise<PlayerAssets> {
  const s = getSession();
  if (!s) throw new Error("not authenticated");
  const html = await (
    await fetch(MUSIC_ORIGIN + "/", {
      headers: {
        Cookie: s.cookie,
        ...(s.visitor_data ? { "X-Goog-Visitor-Id": s.visitor_data } : {}),
        "Accept-Language": "en",
        "User-Agent": WEB_UA,
      },
    })
  ).text();
  const clientVersion =
    html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] ?? s.clientVersion ?? undefined;
  let jsUrl = html.match(/"jsUrl":"([^"]+)"/)?.[1];
  if (!clientVersion || !jsUrl)
    throw new Error("could not locate client version / jsUrl on home page");
  if (jsUrl.startsWith("/")) jsUrl = MUSIC_ORIGIN + jsUrl;
  const playerId = jsUrl.match(/\/player\/([^/]+)\//)?.[1] || "unknown";
  const baseJs = await (await fetch(jsUrl, { headers: { "User-Agent": WEB_UA } })).text();
  const sts = Number(baseJs.match(/signatureTimestamp:(\d+)/)?.[1]);
  if (!sts) throw new Error("could not read signatureTimestamp from base.js");
  const portal = makePortal(baseJs);
  return { playerId, baseJs, sts, clientVersion, portal };
}

async function getAssets(): Promise<PlayerAssets> {
  if (assetsCache && assetsCache.expires > Date.now()) return assetsCache.assets;
  const assets = await fetchAssets();
  assetsCache = { assets, expires: Date.now() + ASSETS_TTL_MS };
  return assets;
}

async function callPremiumPlayer(videoId: string, assets: PlayerAssets): Promise<any> {
  const s = getSession();
  if (!s) throw new Error("not authenticated");
  const body = {
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: assets.clientVersion,
        hl: "en",
        gl: "US",
        visitorData: s.visitor_data ?? undefined,
      },
      user: {},
    },
    videoId,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: "HTML5_PREF_WANTS",
        signatureTimestamp: assets.sts,
      },
    },
    contentCheckOk: true,
    racyCheckOk: true,
  };
  const res = await fetch(
    `${MUSIC_ORIGIN}/youtubei/v1/player?prettyPrint=false${s.apiKey ? `&key=${s.apiKey}` : ""}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: s.cookie,
        Authorization: sapisidAuth(s.cookie),
        Origin: MUSIC_ORIGIN,
        "X-Origin": MUSIC_ORIGIN,
        Referer: MUSIC_ORIGIN + "/",
        "X-Goog-AuthUser": "0",
        ...(s.visitor_data ? { "X-Goog-Visitor-Id": s.visitor_data } : {}),
        "X-Youtube-Client-Name": "67",
        "X-Youtube-Client-Version": assets.clientVersion,
        "User-Agent": WEB_UA,
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`premium player ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getPlayer(videoId: string): Promise<{ player: any; assets: PlayerAssets }> {
  const assets = await getAssets();
  const hit = playerCache.get(videoId);
  if (hit && hit.expires > Date.now()) return { player: hit.player, assets };
  const player = await callPremiumPlayer(videoId, assets);
  playerCache.set(videoId, { player, expires: Date.now() + PLAYER_TTL_MS });
  return { player, assets };
}

function audioFormats(player: any): any[] {
  return (player?.streamingData?.adaptiveFormats ?? []).filter((f: any) =>
    String(f.mimeType).startsWith("audio/")
  );
}

function pickPremium(player: any): any | null {
  const byItag = new Map<number, any>(audioFormats(player).map((f) => [f.itag, f]));
  for (const t of PREMIUM_ITAGS) if (byItag.has(t)) return byItag.get(t);
  return null;
}

// Pick the audio format for the requested tier from the authenticated web
// player. HQ prefers the premium itags (141/774) and otherwise the
// highest-bitrate format; standard mode excludes the premium itags so the
// fallback for blocked videos matches the quality of the anonymous path
// (~itag 251/140) rather than silently upgrading to Premium audio.
function pickAudio(player: any, hq: boolean): any | null {
  if (hq) {
    const premium = pickPremium(player);
    if (premium) return premium;
  }
  const formats = audioFormats(player);
  const pool = hq ? formats : formats.filter((f) => !PREMIUM_ITAGS.includes(f.itag));
  return (pool.length ? pool : formats).sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0] ?? null;
}

// ---- universal n + signature descrambling (drive the player's own URL code) ----
//
// Rather than locate and replay the n-driver ourselves (fragile — each player
// rotates its cipher VM, and the newest families compile n into a multi-step
// bytecode program with no single callable entry), we run the player's OWN
// media-URL decorator and read the signed values back. Every player ships a
// decorator that stamps `&alr=yes` onto a stream URL and, in doing so,
// descrambles the signature and the `n` throttle through its internal cipher VM.
// We find that function by its universal `("alr","yes")` fingerprint, build a URL
// through it, set `n`, trigger its sign method, and read the transformed `s`/`n`
// back out — exactly what the browser does. No per-player pattern; handles
// families the static descramble can't. (Same idea as yt-dlp's yt.solver.core.js.)

// Locate the URL decorator: the function whose body stamps `("alr","yes")` on a
// freshly-wrapped URL object. Cached on the assets (stable per player build).
function decoratorName(assets: PlayerAssets): string | null {
  if (assets.decorator !== undefined) return assets.decorator;
  const at = assets.baseJs.search(/"alr"\s*,\s*"yes"/);
  const head =
    at < 0
      ? null
      : [...assets.baseJs.slice(0, at).matchAll(/\b([A-Za-z0-9$_]+)=function\(/g)].pop();
  assets.decorator = head ? head[1] : null;
  return assets.decorator;
}

// Drive the player's decorator to descramble `s` (the signatureCipher signature)
// and `nIn` (the throttle param) the way the player itself does: construct the URL
// with the raw signature, set `n`, invoke the one prototype method that isn't a
// plain accessor (the sign step that runs the cipher VM), then read the transformed
// values back. Returns null if the decorator can't be driven (older player without
// this structure). evT bounds it so a misfire can't hang the process.
function solveViaDecorator(
  assets: PlayerAssets,
  dec: string,
  s: string,
  nIn: string | null
): { sig: string; n: string | null } | null {
  const expr =
    `(function(){` +
    `var u=${dec}("https://youtube.com/watch?v=yt-dlp-wins","s",encodeURIComponent(${JSON.stringify(s)}));` +
    (nIn ? `u.set("n",${JSON.stringify(nIn)});` : ``) +
    `var p=Object.getPrototypeOf(u),ks=Object.keys(p).concat(Object.getOwnPropertyNames(p));` +
    `for(var i=0;i<ks.length;i++){var k=ks[i];if(["constructor","set","get","clone"].indexOf(k)<0){u[k]();break}}` +
    `var ss=u.get("s");return {sig:ss?decodeURIComponent(ss):null,n:u.get("n")}` +
    `})()`;
  const out = assets.portal.evT(expr, 3000);
  if (!out || typeof out.sig !== "string") return null;
  return { sig: out.sig, n: typeof out.n === "string" ? out.n : null };
}

// Confirm a resolved URL actually streams: a Range probe that returns 2xx means
// the signature and `n` are both correct; 403 means at least one is wrong. This is
// the ground-truth oracle that lets us verify a descramble instead of trusting it
// — so we never hand the player a dead URL again.
async function streamsOk(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(url, { headers: { Range: "bytes=0-1" }, signal: ctrl.signal });
    if (r.body) await r.body.cancel().catch(() => {});
    return r.status === 200 || r.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function buildUrl(baseUrl: string, sp: string, sig: string, n: string | null): string {
  const u = new URL(baseUrl);
  u.searchParams.set(sp, sig);
  if (n) u.searchParams.set("n", n);
  return u.toString();
}

// Turn a player audio format into a ready-to-stream URL. Preferred path: drive the
// player's own URL decorator (universal — handles cipher-VM players). Fallback: the
// static signatureCipher descramble (older single-arg / nested-int players). The
// decorator strategy is verified against googlevideo once per player, then trusted.
async function resolvedUrl(fmt: any, assets: PlayerAssets): Promise<string> {
  if (fmt.url) return fmt.url;
  const cipher = new URLSearchParams(fmt.signatureCipher);
  const baseUrl = cipher.get("url");
  if (!baseUrl) throw new Error("no url/signatureCipher");
  const sp = cipher.get("sp") || "sig";
  const s = cipher.get("s");
  if (!s) throw new Error("no signature in cipher");
  const nIn = new URL(baseUrl).searchParams.get("n");

  // Primary: the player's own decorator (drives its cipher VM for both sig and n).
  const dec = decoratorName(assets);
  if (dec && assets.decoratorOk !== false) {
    const sol = solveViaDecorator(assets, dec, s, nIn);
    const url = sol && sol.sig && (!nIn || sol.n) ? buildUrl(baseUrl, sp, sol.sig, sol.n) : null;
    if (url && assets.decoratorOk) return url; // already verified for this player build
    if (url && (await streamsOk(url))) {
      assets.decoratorOk = true;
      return url;
    }
    // Disable only on the FIRST determination, so a single transient miss can't
    // knock out a decorator that has already proven itself for this player.
    if (assets.decoratorOk === undefined) assets.decoratorOk = false;
  }

  // Fallback: static descramble (throws when it can't solve — caller then drops to
  // the standard ANDROID_VR audio path).
  const { sig, n } = descramble(assets.baseJs, assets.portal, s, nIn);
  const url = buildUrl(baseUrl, sp, sig, n);
  if (await streamsOk(url)) return url;
  throw new Error("premium: descrambled URL rejected by googlevideo");
}

// ---- public API ------------------------------------------------------------

// Resolve a direct, ready-to-stream URL for the premium audio format (itag 141 /
// 774). Descrambles the signatureCipher via the player's own functions. Throws
// when no premium format exists (non-Premium account, or the player changed
// shape) so the caller can fall back to the standard ANDROID_VR path.
export async function resolvePremiumAudio(videoId: string): Promise<AudioFormat> {
  const { player, assets } = await getPlayer(videoId);
  const status = player?.playabilityStatus?.status;
  if (status !== "OK")
    throw new Error(`premium: ${player?.playabilityStatus?.reason || status}`);
  const fmt = pickPremium(player);
  if (!fmt) throw new Error("no premium format (itag 141/774)");
  return {
    itag: fmt.itag,
    url: await resolvedUrl(fmt, assets),
    mimeType: fmt.mimeType,
    bitrate: fmt.bitrate ?? 0,
    contentLength: fmt.contentLength,
  };
}

// Resolve a direct audio URL via the *authenticated* WEB_REMIX web player, as a
// fallback when the anonymous ANDROID_VR path (innertube.ts `resolveAudio`) is
// blocked — most notably age-restricted videos ("Sign in to confirm your age")
// and bot-walled requests, which ANDROID_VR refuses with LOGIN_REQUIRED and no
// formats. Being signed in, this player returns full formats; we descramble the
// signatureCipher exactly as the premium path does. Honors `hq` for the tier.
export async function resolveAuthedAudio(videoId: string, hq: boolean): Promise<AudioFormat> {
  const { player, assets } = await getPlayer(videoId);
  const status = player?.playabilityStatus?.status;
  if (status !== "OK")
    throw new Error(`authed: ${player?.playabilityStatus?.reason || status}`);
  const fmt = pickAudio(player, hq);
  if (!fmt) throw new Error("authed: no audio format");
  return {
    itag: fmt.itag,
    url: await resolvedUrl(fmt, assets),
    mimeType: fmt.mimeType,
    bitrate: fmt.bitrate ?? 0,
    contentLength: fmt.contentLength,
  };
}

// Build "Audioqualität" / stats-for-nerds details from a chosen format (no
// descrambling needed — we only read metadata).
function buildStreamInfo(videoId: string, player: any, f: any): StreamInfo {
  const mime: string = f.mimeType ?? "";
  const container = mime.split(";")[0]?.split("/")[1] ?? null;
  const codec = /codecs="([^"]+)"/.exec(mime)?.[1] ?? null;
  return {
    videoId,
    itag: f.itag ?? null,
    codec,
    container,
    bitrate: f.bitrate ?? null,
    averageBitrate: f.averageBitrate ?? null,
    audioSampleRate: f.audioSampleRate ?? null,
    audioChannels: f.audioChannels ?? null,
    contentLength: f.contentLength ?? null,
    loudnessDb: player?.playerConfig?.audioConfig?.loudnessDb ?? null,
    client: "WEB_REMIX",
  };
}

// "Audioqualität" details for the premium format. Throws when there's none — or
// when the premium stream can't actually be resolved (e.g. an n-driver we can't
// verify), so the caller falls back to the standard stats and the indicator
// reflects what's *really* playing instead of claiming 256k over a fallback.
export async function premiumStreamInfo(videoId: string): Promise<StreamInfo> {
  const { player, assets } = await getPlayer(videoId);
  const status = player?.playabilityStatus?.status;
  if (status !== "OK")
    throw new Error(`premium: ${player?.playabilityStatus?.reason || status}`);
  const f = pickPremium(player);
  if (!f) throw new Error("no premium format (itag 141/774)");
  // Gate on a real, verified resolution (descramble + googlevideo oracle) — the
  // same path the stream takes — so stats never diverge from playback.
  await resolvedUrl(f, assets);
  return buildStreamInfo(videoId, player, f);
}

// Stats for the format the authenticated web player serves for the requested
// tier — used when the anonymous ANDROID_VR stats path is blocked (age-gated /
// login-required), mirroring resolveAuthedAudio's format selection.
export async function authedStreamInfo(videoId: string, hq: boolean): Promise<StreamInfo> {
  const { player } = await getPlayer(videoId);
  const status = player?.playabilityStatus?.status;
  if (status !== "OK")
    throw new Error(`authed: ${player?.playabilityStatus?.reason || status}`);
  const f = pickAudio(player, hq);
  if (!f) throw new Error("authed: no audio format");
  return buildStreamInfo(videoId, player, f);
}
