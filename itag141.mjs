import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";

// ---- config -------------------------------------------------------
const VIDEO_ID = process.argv[2] || "lYBUbBu4W08";
const SESSION_PATHS = [
  process.argv[3],
  process.env.YTM_SESSION,
  "./session.json",
  "./frontend/data/session.json",
  new URL("./frontend/data/session.json", import.meta.url).pathname.replace(
    /^\/(\w:)/,
    "$1",
  ),
].filter(Boolean);
const O = "https://music.youtube.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

// Descramble recipe — pinned to player `ac678d18`.
const PINNED_PLAYER = "ac678d18";
const recipe = {
  sig: (s) => `ty(41,7221,EC(40,4766,${JSON.stringify(s)}))`,
  n: (n) => `EC(19,7741,${JSON.stringify(n)})`,
};

// ---- helpers ------------------------------------------------------
const die = (msg) => {
  console.error("\n✗ " + msg);
  process.exit(1);
};

function loadSession() {
  for (const p of SESSION_PATHS) {
    try {
      const s = JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
      if (s && s.cookie && s.visitor_data) {
        console.log("session:", p);
        return s;
      }
    } catch {
      /* try next */
    }
  }
  die(
    `no usable session JSON found (looked in: ${SESSION_PATHS.join(", ")}).\n` +
      `  Provide one with: node verify-premium-256k.mjs ${VIDEO_ID} path/to/session.json`,
  );
}

function sapisidhash(cookie) {
  const sid = (cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/) ||
    cookie.match(/(?:^|;\s*)__Secure-3PAPISID=([^;]+)/))?.[1];
  if (!sid) die("session cookie has no SAPISID / __Secure-3PAPISID");
  const ts = Math.floor(Date.now() / 1000);
  return `SAPISIDHASH ${ts}_${createHash("sha1").update(`${ts} ${sid} ${O}`).digest("hex")}`;
}

// splice the eval-portal into the player's closure (just after `var T6={...}`)
function buildPortalVM(src) {
  const anchor = src.indexOf("var T6={SR:function");
  if (anchor < 0)
    die(
      "eval-portal anchor `var T6={SR:function` not found — player rotated/restructured.",
    );
  const open = src.indexOf("{", anchor);
  let depth = 0,
    end = -1;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  if (end < 0) die("could not balance the T6 helper braces.");
  const patched =
    src.slice(0, end) +
    ";globalThis.__ev=function(_n){try{return eval(_n)}catch(e){return '__ERR__'+e}};" +
    src.slice(end);

  const stub = () => proxy;
  const proxy = new Proxy(stub, {
    get(_, p) {
      if (p === "length") return 0;
      if (p === "toString" || p === Symbol.toPrimitive) return () => "";
      return proxy;
    },
    set: () => true,
    apply: () => proxy,
    construct: () => proxy,
    has: () => true,
  });
  const ctx = {
    navigator: {
      userAgent: UA,
      platform: "Win32",
      language: "de",
      languages: ["de"],
    },
    location: {
      href: O + "/",
      protocol: "https:",
      hostname: "music.youtube.com",
      origin: O,
      search: "",
      hash: "",
      pathname: "/",
    },
    document: proxy,
    XMLHttpRequest: function () {
      return proxy;
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
    btoa: (x) => Buffer.from(x, "binary").toString("base64"),
    atob: (x) => Buffer.from(x, "base64").toString("binary"),
    performance: { now: () => Date.now() },
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.top = ctx;
  vm.createContext(ctx);
  try {
    vm.runInContext(patched, ctx, { timeout: 10000 });
  } catch {
    /* bootstrap may throw; portal still set */
  }
  if (typeof ctx.__ev !== "function")
    die("eval-portal did not install (vm bootstrap failed before the splice).");
  return ctx.__ev;
}

// ---- main ---------------------------------------------------------
const sess = loadSession();

// 1) discover the live player + its signatureTimestamp
const homeHtml = await (
  await fetch(O + "/", {
    headers: {
      Cookie: sess.cookie,
      "X-Goog-Visitor-Id": sess.visitor_data,
      "User-Agent": UA,
      "Accept-Language": "de",
    },
  })
).text();
const jsPath = homeHtml.match(/"jsUrl":"([^"]+)"/)?.[1];
if (!jsPath) die("could not find jsUrl on the home page.");
const jsUrl = jsPath.startsWith("http") ? jsPath : O + jsPath;
const playerId = jsUrl.match(/player\/([\w-]+)\//)?.[1] || "?";
const baseJs = await (
  await fetch(jsUrl, { headers: { "User-Agent": UA } })
).text();
const sts = Number(
  baseJs.match(/signatureTimestamp:(\d+)/)?.[1] ||
    baseJs.match(/sts:(\d+)/)?.[1],
);
console.log(
  "player:",
  playerId,
  "| sts:",
  sts,
  "| base.js:",
  baseJs.length,
  "bytes",
);
if (playerId !== PINNED_PLAYER)
  console.log(
    `⚠  live player is ${playerId} but the opcodes are pinned to ${PINNED_PLAYER}.\n   If the download fails, the recipe needs re-deriving (reverseengeneer.md §8.1).`,
  );

// 2) authenticated WEB_REMIX player call -> itag 141 cipher
const client = {
  ...(sess.context?.client ?? {}),
  clientName: "WEB_REMIX",
  clientVersion: sess.clientVersion,
  hl: "de",
  gl: "DE",
  visitorData: sess.visitor_data,
};
const pr = await (
  await fetch(`${O}/youtubei/v1/player?prettyPrint=false&key=${sess.apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sess.cookie,
      Authorization: sapisidhash(sess.cookie),
      Origin: O,
      "X-Origin": O,
      Referer: O + "/",
      "X-Goog-AuthUser": "0",
      "X-Goog-Visitor-Id": sess.visitor_data,
      "X-Youtube-Client-Name": "67",
      "X-Youtube-Client-Version": sess.clientVersion,
      "User-Agent": UA,
    },
    body: JSON.stringify({
      context: { client },
      videoId: VIDEO_ID,
      playbackContext: {
        contentPlaybackContext: {
          html5Preference: "HTML5_PREF_WANTS",
          signatureTimestamp: sts,
        },
      },
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  })
).json();

if (pr.playabilityStatus?.status !== "OK")
  die(
    `playabilityStatus = ${pr.playabilityStatus?.status} (${pr.playabilityStatus?.reason || ""})`,
  );
const fmt = pr.streamingData?.adaptiveFormats?.find((f) => f.itag === 141);
if (!fmt)
  die(
    `itag 141 not offered for ${VIDEO_ID} — is this account Premium? audio itags: ` +
      (pr.streamingData?.adaptiveFormats || [])
        .filter((f) => String(f.mimeType).includes("audio"))
        .map((f) => f.itag)
        .join(","),
  );
console.log("track:", pr.videoDetails?.title, "—", pr.videoDetails?.author);

const cipher = new URLSearchParams(fmt.signatureCipher);
const s = cipher.get("s"),
  sp = cipher.get("sp") || "sig",
  baseUrl = cipher.get("url");
const nOrig = new URL(baseUrl).searchParams.get("n");

// 3) descramble natively through the eval-portal
const ev = buildPortalVM(baseJs);
const sig = ev(recipe.sig(s));
const nNew = ev(recipe.n(nOrig));
if (typeof sig !== "string" || sig.startsWith("__ERR__"))
  die(`sig descramble failed: ${sig}`);
if (typeof nNew !== "string" || nNew.startsWith("__ERR__"))
  die(`n transform failed: ${nNew}`);
console.log(
  `sig: ${s.length} chars -> ${sig.length} chars | n: ${nOrig} -> ${nNew}`,
);

// 4) build URL, download, verify
const u = new URL(baseUrl);
u.searchParams.set(sp, sig);
u.searchParams.set("n", nNew);
const clen = Number(u.searchParams.get("clen")),
  dur = Number(u.searchParams.get("dur"));
u.searchParams.set("range", "0-" + (clen - 1));

const t0 = Date.now();
const res = await fetch(u, { headers: { "User-Agent": UA } });
const buf = Buffer.from(await res.arrayBuffer());
const kbps = Math.round((clen * 8) / dur / 1000);
const isMp4 = buf.slice(4, 8).toString("latin1") === "ftyp";
const ok =
  (res.status === 200 || res.status === 206) && buf.length === clen && isMp4;

console.log("\n----------------------------------------------------------");
console.log(`HTTP ${res.status} ${res.headers.get("content-type")}`);
console.log(
  `downloaded ${buf.length}/${clen} bytes (complete: ${buf.length === clen}) in ${Date.now() - t0} ms`,
);
console.log(
  `bitrate ${kbps} kbps | header ${buf.slice(0, 12).toString("hex")} | valid mp4: ${isMp4}`,
);
console.log("----------------------------------------------------------");
if (ok)
  console.log(
    `✓ PASS — premium itag 141 (${kbps} kbps) fetched natively, no browser.`,
  );
else {
  console.log(
    "✗ FAIL — see above (likely a base.js rotation; re-derive the opcodes).",
  );
  process.exit(1);
}
