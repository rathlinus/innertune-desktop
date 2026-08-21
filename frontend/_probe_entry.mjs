// server/premium.ts
import { createHash } from "node:crypto";
import { createContext, runInContext } from "node:vm";

// server/chrome.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
var dataDir = () => process.env.YTM_DATA || path.join(process.cwd(), "data");
var sessionFile = () => path.join(dataDir(), "session.json");
var CAPTURE_TIMEOUT_MS = 5 * 60 * 1e3;
var CHROME_CANDIDATES = [
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
  "/snap/bin/chromium"
];
var cached;
function getSession() {
  if (cached === void 0) {
    cached = null;
    if (existsSync(sessionFile())) {
      try {
        const raw = readFileSync(sessionFile(), "utf8").trim();
        if (raw) cached = JSON.parse(raw);
      } catch {
        cached = null;
      }
    }
  }
  return cached;
}

// server/premium.ts
var MUSIC_ORIGIN = "https://music.youtube.com";
var WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
var PREMIUM_ITAGS = [141, 774];
var assetsCache = null;
var ASSETS_TTL_MS = 30 * 60 * 1e3;
var playerCache = /* @__PURE__ */ new Map();
var PLAYER_TTL_MS = 2 * 60 * 1e3;
function sapisidAuth(cookie) {
  const sap = cookie.match(
    /(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID|__Secure-1PAPISID)=([^;]+)/
  )?.[1];
  if (!sap) throw new Error("no SAPISID cookie");
  const ts = Math.floor(Date.now() / 1e3);
  const hash = createHash("sha1").update(`${ts} ${sap} ${MUSIC_ORIGIN}`).digest("hex");
  return `SAPISIDHASH ${ts}_${hash}`;
}
function matchBrace(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") d++;
    else if (s[i] === "}" && !--d) return i + 1;
  }
  return -1;
}
function makePortal(baseJs) {
  const swap = baseJs.match(
    /[A-Za-z0-9$_]+:function\(([A-Za-z0-9$_]+),([A-Za-z0-9$_]+)\)\{var [A-Za-z0-9$_]+=\1\[0\];\1\[0\]=\1\[\2%\1(?:\.length|\[([A-Za-z0-9$_]+)\[\d+\]\])\]/
  );
  if (!swap) throw new Error("swap helper not found (player structure changed)");
  const ARR = swap[3] || null;
  const objHead = [
    ...baseJs.slice(0, baseJs.indexOf(swap[0])).matchAll(/([A-Za-z0-9$_]+)=\{/g)
  ].pop();
  if (!objHead) throw new Error("helper object not found");
  const objEnd = matchBrace(baseJs, baseJs.indexOf("{", objHead.index));
  const src = baseJs.slice(0, objEnd) + ";globalThis.__ev=function(_x){try{return eval(_x)}catch(e){return undefined}};" + baseJs.slice(objEnd);
  const makeStub = () => {
    const f = () => stub;
    const stub = new Proxy(f, {
      get: (_, p) => p === "length" ? 0 : p === "toString" || p === Symbol.toPrimitive ? () => "" : stub,
      set: () => true,
      apply: () => stub,
      construct: () => stub,
      has: () => true
    });
    return stub;
  };
  const ctx = {
    navigator: {
      userAgent: WEB_UA,
      platform: "Win32",
      languages: ["en"],
      language: "en"
    },
    location: {
      href: MUSIC_ORIGIN + "/",
      protocol: "https:",
      hostname: "music.youtube.com",
      origin: MUSIC_ORIGIN,
      search: "",
      hash: "",
      pathname: "/"
    },
    document: makeStub(),
    XMLHttpRequest: function() {
      return makeStub();
    },
    setTimeout: () => 0,
    clearTimeout: () => {
    },
    setInterval: () => 0,
    clearInterval: () => {
    },
    console: { log() {
    }, warn() {
    }, error() {
    }, info() {
    }, debug() {
    } },
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
    btoa: (x) => Buffer.from(x, "binary").toString("base64"),
    atob: (x) => Buffer.from(x, "base64").toString("binary"),
    performance: { now: () => Date.now() }
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.top = ctx;
  createContext(ctx);
  runInContext(src, ctx, { timeout: 1e4 });
  if (typeof ctx.__ev !== "function") throw new Error("eval-portal did not initialise");
  const evT = (expr, ms = 150) => {
    try {
      runInContext(`globalThis.__r=__ev(${JSON.stringify(expr)})`, ctx, { timeout: ms });
      return ctx.__r;
    } catch {
      return void 0;
    }
  };
  return { ev: ctx.__ev, evT, ARR };
}
var valid = (x, ref) => typeof x === "string" && x.length >= 8 && x !== ref && /^[A-Za-z0-9_-]+$/.test(x);
var validN = (x, ref) => valid(x, ref) && !x.includes(ref) && x.length <= ref.length + 12;
function isReorderOf(x, ref) {
  if (typeof x !== "string" || x.length < 8 || x === ref || x.length > ref.length)
    return false;
  const cnt = {};
  for (const c of ref) cnt[c] = (cnt[c] || 0) + 1;
  for (const c of x) {
    if (!cnt[c]) return false;
    cnt[c]--;
  }
  return x.length >= ref.length - 30;
}
function descramble(baseJs, portal, sIn, nIn) {
  const { ev, ARR } = portal;
  let sig = null;
  let sigFn = null;
  const sc = baseJs.match(
    /([A-Za-z0-9$_]+)\((\d+),(\d+),([A-Za-z0-9$_]+)\((\d+),(\d+),[A-Za-z0-9$_.]+\.s\)\)/
  );
  if (sc) {
    const [, S, A, B, E, C, D] = sc;
    const r = ev(`${S}(${A},${B},${E}(${C},${D},${JSON.stringify(sIn)}))`);
    if (typeof r === "string" && r.length >= 10) sig = r;
  }
  if (!sig) {
    const cand = /* @__PURE__ */ new Set();
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
  let nOut = null;
  if (nIn) {
    const nMatch = ARR ? baseJs.match(
      new RegExp(
        "z\\[" + ARR + "\\[([A-Za-z0-9$_]+)\\^(\\d+)\\]\\]\\(" + ARR + "\\[\\1\\^\\d+\\]\\)\\s*[,;]\\s*(?:var\\s+)?[A-Za-z0-9$_]+=\\["
      )
    ) : null;
    if (nMatch) {
      const splitOff = Number(nMatch[2]);
      const fn = [
        ...baseJs.slice(0, nMatch.index).matchAll(/([A-Za-z0-9$_]+)=function\(/g)
      ].pop();
      const nDriver = fn ? fn[1] : null;
      const splitIdx = ev(`${ARR}.indexOf("split")`);
      if (nDriver && typeof splitIdx === "number" && splitIdx >= 0) {
        const Q = splitIdx ^ splitOff;
        const counts = {};
        for (let M = 0; M < 64; M++) {
          const r = ev(`${nDriver}(${M},${Q ^ M},${JSON.stringify(nIn)})`);
          if (validN(r, nIn)) counts[r] = (counts[r] || 0) + 1;
        }
        const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (ranked.length) nOut = ranked[0][0];
      }
    }
    if (!nOut && ARR) {
      const splitIdx = ev(`${ARR}.indexOf("split")`);
      const splitRe = new RegExp(
        "[A-Za-z0-9$_]+\\[" + ARR + "\\[([A-Za-z0-9$_]+)\\^(\\d+)\\]\\]\\(" + ARR + "\\[([A-Za-z0-9$_]+)\\^(\\d+)\\]\\)",
        "g"
      );
      const tried = /* @__PURE__ */ new Set();
      for (const selfRef of baseJs.matchAll(
        /([A-Za-z0-9$_]+)\[[A-Za-z0-9$_]+\^\d+\]=\1[,;]/g
      )) {
        if (nOut || typeof splitIdx !== "number" || splitIdx < 0) break;
        const fnDef = [
          ...baseJs.slice(0, selfRef.index).matchAll(/([A-Za-z0-9$_]+)=function\(/g)
        ].pop();
        if (!fnDef || tried.has(fnDef[1])) continue;
        const win = baseJs.slice(Math.max(0, selfRef.index - 2e3), selfRef.index);
        const accs = [...win.matchAll(splitRe)].filter((m) => m[1] === m[3]);
        if (!accs.length) continue;
        tried.add(fnDef[1]);
        const fn = fnDef[1];
        const Q = splitIdx ^ Number(accs[accs.length - 1][2]);
        const counts = {};
        for (let M = 0; M < 256; M++) {
          const r = ev(`${fn}(${M},${Q ^ M},${JSON.stringify(nIn)})`);
          if (validN(r, nIn)) counts[r] = (counts[r] || 0) + 1;
        }
        const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (ranked.length && ranked[0][1] >= 3) nOut = ranked[0][0];
      }
    }
    if (!nOut) {
      const cand = /* @__PURE__ */ new Map();
      const nearestBefore = (v, end) => {
        const w = baseJs.slice(Math.max(0, end - 140), end);
        for (const [re, dec] of [
          [`${v}=([A-Za-z0-9$_]+(?:\\[\\d+\\])?)\\(${v}[,)]`, false],
          [`${v}=([A-Za-z0-9$_]+(?:\\[\\d+\\])?)\\(decodeURIComponent\\(${v}\\)`, true]
        ]) {
          const all = [...w.matchAll(new RegExp(re, "g"))];
          if (all.length) {
            const fn = all[all.length - 1][1];
            if (fn !== sigFn) cand.set(fn, dec);
          }
        }
      };
      for (const m of baseJs.matchAll(/\.set\(\s*"n"\s*,\s*(\w+)\s*\)/g))
        nearestBefore(m[1], m.index);
      for (const m of baseJs.matchAll(
        /\[([A-Za-z0-9$_]+)\[(\d+)\]\]\(\1\[(\d+)\],\s*(\w+)\)/g
      )) {
        const [, A, i, j, v] = m;
        if (ev(`${A}[${j}]`) === "n" && ev(`${A}[${i}]`) === "set")
          nearestBefore(v, m.index);
      }
      const probe = nIn.length > 1 ? nIn.slice(1) + nIn[0] : nIn + "A";
      for (const [fn, dec] of cand) {
        const call = (v) => ev(`${fn}(${dec ? `decodeURIComponent(${JSON.stringify(v)})` : JSON.stringify(v)})`);
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
async function fetchAssets() {
  const s = getSession();
  if (!s) throw new Error("not authenticated");
  const html = await (await fetch(MUSIC_ORIGIN + "/", {
    headers: {
      Cookie: s.cookie,
      ...s.visitor_data ? { "X-Goog-Visitor-Id": s.visitor_data } : {},
      "Accept-Language": "en",
      "User-Agent": WEB_UA
    }
  })).text();
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] ?? s.clientVersion ?? void 0;
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
async function getAssets() {
  if (assetsCache && assetsCache.expires > Date.now()) return assetsCache.assets;
  const assets = await fetchAssets();
  assetsCache = { assets, expires: Date.now() + ASSETS_TTL_MS };
  return assets;
}
async function callPremiumPlayer(videoId, assets) {
  const s = getSession();
  if (!s) throw new Error("not authenticated");
  const body = {
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: assets.clientVersion,
        hl: "en",
        gl: "US",
        visitorData: s.visitor_data ?? void 0
      },
      user: {}
    },
    videoId,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: "HTML5_PREF_WANTS",
        signatureTimestamp: assets.sts
      }
    },
    contentCheckOk: true,
    racyCheckOk: true
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
        ...s.visitor_data ? { "X-Goog-Visitor-Id": s.visitor_data } : {},
        "X-Youtube-Client-Name": "67",
        "X-Youtube-Client-Version": assets.clientVersion,
        "User-Agent": WEB_UA
      },
      body: JSON.stringify(body)
    }
  );
  if (!res.ok) throw new Error(`premium player ${res.status}: ${await res.text()}`);
  return res.json();
}
async function getPlayer(videoId) {
  const assets = await getAssets();
  const hit = playerCache.get(videoId);
  if (hit && hit.expires > Date.now()) return { player: hit.player, assets };
  const player = await callPremiumPlayer(videoId, assets);
  playerCache.set(videoId, { player, expires: Date.now() + PLAYER_TTL_MS });
  return { player, assets };
}
function audioFormats(player) {
  return (player?.streamingData?.adaptiveFormats ?? []).filter(
    (f) => String(f.mimeType).startsWith("audio/")
  );
}
function pickPremium(player) {
  const byItag = new Map(audioFormats(player).map((f) => [f.itag, f]));
  for (const t of PREMIUM_ITAGS) if (byItag.has(t)) return byItag.get(t);
  return null;
}
function pickAudio(player, hq) {
  if (hq) {
    const premium = pickPremium(player);
    if (premium) return premium;
  }
  const formats = audioFormats(player);
  const pool = hq ? formats : formats.filter((f) => !PREMIUM_ITAGS.includes(f.itag));
  return (pool.length ? pool : formats).sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0] ?? null;
}
function decoratorName(assets) {
  if (assets.decorator !== void 0) return assets.decorator;
  const js = assets.baseJs;
  const sig = js.match(
    /(?<![.\w$])([A-Za-z0-9$_]+)=function\((\w+)[^)]*\)\{\2=new [\w.$]+\(\2,\s*!0[,)][^]{0,40}?\.set\("alr","yes"\)/
  );
  let name = sig ? sig[1] : null;
  if (!name) {
    const at = js.search(/"alr"\s*,\s*"yes"/);
    const head = at < 0 ? null : [...js.slice(0, at).matchAll(/\b([A-Za-z0-9$_]+)=function\(/g)].pop();
    name = head ? head[1] : null;
  }
  assets.decorator = name;
  return assets.decorator;
}
function solveViaDecorator(assets, dec, s, nIn) {
  const expr = `(function(){var u=${dec}("https://youtube.com/watch?v=yt-dlp-wins","s",encodeURIComponent(${JSON.stringify(s)}));` + (nIn ? `u.set("n",${JSON.stringify(nIn)});` : ``) + `var p=Object.getPrototypeOf(u),ks=Object.keys(p).concat(Object.getOwnPropertyNames(p));for(var i=0;i<ks.length;i++){var k=ks[i];if(["constructor","set","get","clone"].indexOf(k)<0){u[k]();break}}var ss=u.get("s");return {sig:ss?decodeURIComponent(ss):null,n:u.get("n")}})()`;
  const out = assets.portal.evT(expr, 3e3);
  if (!out || typeof out.sig !== "string") return null;
  return { sig: out.sig, n: typeof out.n === "string" ? out.n : null };
}
async function streamsOk(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7e3);
  try {
    const r = await fetch(url, { headers: { Range: "bytes=0-1" }, signal: ctrl.signal });
    if (r.body) await r.body.cancel().catch(() => {
    });
    return r.status === 200 || r.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
function buildUrl(baseUrl, sp, sig, n) {
  const u = new URL(baseUrl);
  u.searchParams.set(sp, sig);
  if (n) u.searchParams.set("n", n);
  return u.toString();
}
async function resolvedUrl(fmt, assets) {
  if (fmt.url) return fmt.url;
  const cipher = new URLSearchParams(fmt.signatureCipher);
  const baseUrl = cipher.get("url");
  if (!baseUrl) throw new Error("no url/signatureCipher");
  const sp = cipher.get("sp") || "sig";
  const s = cipher.get("s");
  if (!s) throw new Error("no signature in cipher");
  const nIn = new URL(baseUrl).searchParams.get("n");
  const dec = decoratorName(assets);
  let decUrl = null;
  if (dec) {
    const sol = solveViaDecorator(assets, dec, s, nIn);
    if (sol && sol.sig && (!nIn || sol.n)) {
      decUrl = buildUrl(baseUrl, sp, sol.sig, sol.n);
      if (assets.decoratorOk) return decUrl;
      if (await streamsOk(decUrl)) {
        assets.decoratorOk = true;
        return decUrl;
      }
    }
  }
  try {
    const { sig, n } = descramble(assets.baseJs, assets.portal, s, nIn);
    return buildUrl(baseUrl, sp, sig, n);
  } catch (e) {
    if (decUrl) return decUrl;
    throw e;
  }
}
async function resolvePremiumAudio(videoId) {
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
    contentLength: fmt.contentLength
  };
}
async function resolveAuthedAudio(videoId, hq) {
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
    contentLength: fmt.contentLength
  };
}

// _probe_entry.ts
async function check(label, r) {
  const clen = Number(r.contentLength);
  for (const range of ["bytes=0-", `bytes=${clen - 1e5}-${clen - 1}`, "bytes=2097152-3145727"]) {
    const res = await fetch(r.url, { headers: { Range: range } });
    console.log(label.padEnd(16), "itag", r.itag, range.padEnd(24), "->", res.status, res.headers.get("content-range"));
    await res.body?.cancel().catch(() => {
    });
  }
  const full = await fetch(r.url);
  const buf = await full.arrayBuffer();
  console.log(label.padEnd(16), "full GET ->", full.status, buf.byteLength, "of", clen, buf.byteLength === clen ? "COMPLETE" : "TRUNCATED");
}
async function main() {
  await check("authed lo", await resolveAuthedAudio("JZN65HtfVno", false));
  await check("premium hq", await resolvePremiumAudio("JZN65HtfVno"));
}
main();
