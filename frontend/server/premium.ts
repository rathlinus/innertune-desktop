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
  ARR: string | null;
}

interface PlayerAssets {
  playerId: string;
  baseJs: string;
  sts: number;
  clientVersion: string;
  portal: Portal;
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
  return { ev: ctx.__ev, ARR };
}

// ---- signature / n descrambling -------------------------------------------

const valid = (x: any, ref: string) =>
  typeof x === "string" && x.length >= 8 && x !== ref && /^[A-Za-z0-9_-]+$/.test(x);

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
          if (valid(r, nIn)) counts[r] = (counts[r] || 0) + 1;
        }
        const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (ranked.length) nOut = ranked[0][0];
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
        if (valid(r, nIn) && r.length <= nIn.length + 12 && call(probe) !== r) {
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

function pickPremium(player: any): any | null {
  const formats: any[] = (player?.streamingData?.adaptiveFormats ?? []).filter((f: any) =>
    String(f.mimeType).startsWith("audio/")
  );
  const byItag = new Map<number, any>(formats.map((f) => [f.itag, f]));
  for (const t of PREMIUM_ITAGS) if (byItag.has(t)) return byItag.get(t);
  return null;
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

  let url: string | undefined = fmt.url;
  if (!url) {
    const cipher = new URLSearchParams(fmt.signatureCipher);
    const baseUrl = cipher.get("url");
    if (!baseUrl) throw new Error("premium: no url/signatureCipher");
    const sp = cipher.get("sp") || "sig";
    const s = cipher.get("s");
    if (!s) throw new Error("premium: no signature in cipher");
    const nOrig = new URL(baseUrl).searchParams.get("n");
    const { sig, n } = descramble(assets.baseJs, assets.portal, s, nOrig);
    const u = new URL(baseUrl);
    u.searchParams.set(sp, sig);
    if (n) u.searchParams.set("n", n);
    url = u.toString();
  }
  return {
    itag: fmt.itag,
    url,
    mimeType: fmt.mimeType,
    bitrate: fmt.bitrate ?? 0,
    contentLength: fmt.contentLength,
  };
}

// "Audioqualität" details for the premium format (no descrambling needed — we
// only read metadata). Throws when there's no premium format.
export async function premiumStreamInfo(videoId: string): Promise<StreamInfo> {
  const { player } = await getPlayer(videoId);
  const status = player?.playabilityStatus?.status;
  if (status !== "OK")
    throw new Error(`premium: ${player?.playabilityStatus?.reason || status}`);
  const f = pickPremium(player);
  if (!f) throw new Error("no premium format (itag 141/774)");
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
