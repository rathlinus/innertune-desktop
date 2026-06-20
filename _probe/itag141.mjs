#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

process.on("unhandledRejection", () => {});

const DOMAIN = "https://music.youtube.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const PREMIUM_ITAGS = [141, 774];


const sess = JSON.parse(
  readFileSync(
    new URL("../frontend/data/session.json", import.meta.url),
    "utf8",
  ).replace(/^﻿/, ""),
);

function sapisidHash() {
  const sap = sess.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/)[1];
  const ts = Math.floor(Date.now() / 1000);
  return `SAPISIDHASH ${ts}_${createHash("sha1").update(`${ts} ${sap} ${DOMAIN}`).digest("hex")}`;
}

// fetch player assets
async function fetchPlayerAssets() {
  const html = await (
    await fetch(DOMAIN + "/", {
      headers: {
        Cookie: sess.cookie,
        "X-Goog-Visitor-Id": sess.visitor_data,
        "Accept-Language": "en",
        "User-Agent": UA,
      },
    })
  ).text();
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
  let jsUrl = html.match(/"jsUrl":"([^"]+)"/)?.[1];
  if (!clientVersion || !jsUrl)
    throw new Error("could not locate client version / jsUrl on home page");
  if (jsUrl.startsWith("/")) jsUrl = DOMAIN + jsUrl;
  const playerId = jsUrl.match(/\/player\/([^/]+)\//)?.[1] || "unknown";
  const baseJs = await (
    await fetch(jsUrl, { headers: { "User-Agent": UA } })
  ).text();
  const sts = baseJs.match(/signatureTimestamp:(\d+)/)?.[1];
  if (!sts) throw new Error("could not read signatureTimestamp from base.js");
  return { playerId, baseJs, sts: Number(sts), clientVersion };
}

// WEB_REMIX player call
async function playerCall(videoId, { sts, clientVersion }) {
  const body = {
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion,
        hl: "en",
        gl: "US",
        visitorData: sess.visitor_data,
      },
      user: {},
    },
    videoId,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: "HTML5_PREF_WANTS",
        signatureTimestamp: sts,
      },
    },
    contentCheckOk: true,
    racyCheckOk: true,
  };
  const res = await fetch(
    `${DOMAIN}/youtubei/v1/player?prettyPrint=false&key=${sess.apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sess.cookie,
        Authorization: sapisidHash(),
        Origin: DOMAIN,
        "X-Origin": DOMAIN,
        Referer: DOMAIN + "/",
        "X-Goog-AuthUser": "0",
        "X-Goog-Visitor-Id": sess.visitor_data,
        "X-Youtube-Client-Name": "67",
        "X-Youtube-Client-Version": clientVersion,
        "User-Agent": UA,
      },
      body: JSON.stringify(body),
    },
  );
  return res.json();
}

// deriver
function matchBrace(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") d++;
    else if (s[i] === "}" && !--d) return i + 1;
  }
  return -1;
}

// Build the eval-portal: run the whole base.js in a VM, expose an in-closure
// `eval` so the player's own cipher functions can be invoked by name. The helper
// object (reverse/swap/splice) exists in every player family; we inject right
// after it. The swap regex accepts both the index-aliased length (`a[b%a[r[8]]]`,
// current/classic obfuscated builds) and the plain `a[b%a.length]` (older builds);
// for the aliased form it also captures the string-alias array name (`ARR`), which
// the live n-driver needs.
function makePortal(baseJs) {
  const swap = baseJs.match(
    /[A-Za-z0-9$_]+:function\(([A-Za-z0-9$_]+),([A-Za-z0-9$_]+)\)\{var [A-Za-z0-9$_]+=\1\[0\];\1\[0\]=\1\[\2%\1(?:\.length|\[([A-Za-z0-9$_]+)\[\d+\]\])\]/,
  );
  if (!swap)
    throw new Error("swap helper not found (player structure changed)");
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
    const stub = new Proxy(f, {
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
  const ctx = {
    navigator: {
      userAgent: UA,
      platform: "Win32",
      languages: ["en"],
      language: "en",
    },
    location: {
      href: DOMAIN + "/",
      protocol: "https:",
      hostname: "music.youtube.com",
      origin: DOMAIN,
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
    btoa: (x) => Buffer.from(x, "binary").toString("base64"),
    atob: (x) => Buffer.from(x, "base64").toString("binary"),
    performance: { now: () => Date.now() },
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.top = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { timeout: 10000 });
  if (typeof ctx.__ev !== "function")
    throw new Error("eval-portal did not initialise");
  return { ev: ctx.__ev, ARR };
}

// url-safe transform check (n outputs, and a coarse sig check)
const valid = (x, ref) =>
  typeof x === "string" && x.length >= 8 && x !== ref && /^[A-Za-z0-9_-]+$/.test(x);

// a descrambled signature is a reorder of the input chars with a few spliced off,
// i.e. a sub-multiset of the input. Charset-agnostic, so it accepts sigs that
// contain non-url-safe chars, and rejects base64/unrelated functions.
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

// Descramble a signatureCipher `s` (and optional `n`) by replaying the player's
// own cipher functions. Tries the current music-player family first (verified
// end-to-end), then falls back to the classic single-arg-decipher family so a
// structural player rotation keeps working. Throws (loud, never silently wrong)
// if no strategy matches.
function descramble(baseJs, sIn, nIn) {
  const { ev, ARR } = makePortal(baseJs);

  // ---------- signature ----------
  let sig = null;
  let sigFn = null;
  // (A) live/nested-int form: SIGFN(a,b,ECFN(c,d,X.s))
  const sc = baseJs.match(
    /([A-Za-z0-9$_]+)\((\d+),(\d+),([A-Za-z0-9$_]+)\((\d+),(\d+),[A-Za-z0-9$_.]+\.s\)\)/,
  );
  if (sc) {
    const [, S, A, B, E, C, D] = sc;
    const r = ev(`${S}(${A},${B},${E}(${C},${D},${JSON.stringify(sIn)}))`);
    if (typeof r === "string" && r.length >= 10) sig = r;
  }
  // (B) classic single-arg decipher FN(s): the function (applied at a
  // decodeURIComponent site, or a plain split..join body) whose output is a
  // reorder of the input.
  if (!sig) {
    const cand = new Set();
    for (const m of baseJs.matchAll(/([A-Za-z0-9$_]+)\(decodeURIComponent\(/g))
      cand.add(m[1]);
    for (const m of baseJs.matchAll(
      /([A-Za-z0-9$_]+)=function\(\w\)\{\w=\w(?:\.split\(""\)|\[[A-Za-z0-9$_]+\[\d+\]\]\([A-Za-z0-9$_]+\[\d+\]\))/g,
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
  if (!sig)
    throw new Error("signature: no strategy matched (player structure changed)");

  // ---------- n-challenge ----------
  let nOut = null;
  if (nIn) {
    // (A) live n-driver: brute the small XOR-masked index space, rank by frequency.
    const nMatch = ARR
      ? baseJs.match(
          new RegExp(
            "z\\[" +
              ARR +
              "\\[([A-Za-z0-9$_]+)\\^(\\d+)\\]\\]\\(" +
              ARR +
              "\\[\\1\\^\\d+\\]\\)\\s*[,;]\\s*(?:var\\s+)?[A-Za-z0-9$_]+=\\[",
          ),
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
        const counts = {};
        for (let M = 0; M < 64; M++) {
          const r = ev(`${nDriver}(${M},${Q ^ M},${JSON.stringify(nIn)})`);
          if (valid(r, nIn)) counts[r] = (counts[r] || 0) + 1;
        }
        const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (ranked.length) nOut = ranked[0][0];
      }
    }
    // (B) classic n: anchor on the actual n-application site. The player rewrites
    // the "n" query param as `v = NFUNC(v)` (NFUNC is a plain name or an array
    // element like Jvk[0]) then sets it back. The "n" key may be a literal or an
    // alias-array element (e.g. r[23]); resolve both, recover the variable the
    // param is set from, then the function that produced it.
    if (!nOut) {
      // The set-variable is a generic temp (l, b, ...), so `v=NFUNC(v)` would match
      // thousands of unrelated sites. Localise: the assignment sits in the SAME
      // statement just before the set, so only look in a short window ending at it,
      // taking the assignment closest to the set.
      const cand = new Map(); // fn -> wrapInDecode
      const nearestBefore = (v, end) => {
        const w = baseJs.slice(Math.max(0, end - 140), end);
        for (const [re, dec] of [
          [`${v}=([A-Za-z0-9$_]+(?:\\[\\d+\\])?)\\(${v}[,)]`, false],
          [`${v}=([A-Za-z0-9$_]+(?:\\[\\d+\\])?)\\(decodeURIComponent\\(${v}\\)`, true],
        ]) {
          const all = [...w.matchAll(new RegExp(re, "g"))];
          if (all.length) {
            const fn = all[all.length - 1][1];
            if (fn !== sigFn) cand.set(fn, dec);
          }
        }
      };
      // literal: X.set("n", VAR)
      for (const m of baseJs.matchAll(/\.set\(\s*"n"\s*,\s*(\w+)\s*\)/g))
        nearestBefore(m[1], m.index);
      // aliased: [A[i]](A[j], VAR) with A[j]==="n", A[i]==="set" (resolve via portal)
      for (const m of baseJs.matchAll(
        /\[([A-Za-z0-9$_]+)\[(\d+)\]\]\(\1\[(\d+)\],\s*(\w+)\)/g,
      )) {
        const [, A, i, j, v] = m;
        if (ev(`${A}[${j}]`) === "n" && ev(`${A}[${i}]`) === "set")
          nearestBefore(v, m.index);
      }
      // verify each candidate is a real, input-sensitive transform
      const probe = nIn.length > 1 ? nIn.slice(1) + nIn[0] : nIn + "A";
      for (const [fn, dec] of cand) {
        const call = (v) =>
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

export { descramble, makePortal, matchBrace, fetchPlayerAssets, playerCall, UA, DOMAIN };

// mainh
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
const arg = process.argv[2] || "";
const VID = (arg.match(/[?&]v=([^&]+)/) || [, arg])[1];
if (!VID) {
  console.error("usage: node itag141.mjs <videoId|watch-url> [outfile]");
  process.exit(1);
}
const assets = await fetchPlayerAssets();
console.log(
  `player ${assets.playerId} | client ${assets.clientVersion} | sts ${assets.sts}`,
);

const pr = await playerCall(VID, assets);
const status = pr?.playabilityStatus?.status;
if (status !== "OK") {
  console.error(`not playable: ${pr?.playabilityStatus?.reason || status}`);
  process.exit(1);
}
const vd = pr.videoDetails || {};
const formats = Object.fromEntries(
  (pr.streamingData?.adaptiveFormats || [])
    .filter((f) => String(f.mimeType).startsWith("audio/"))
    .map((f) => [f.itag, f]),
);
const fmt = PREMIUM_ITAGS.map((t) => formats[t]).find(Boolean);
if (!fmt) {
  console.error(
    "no premium HQ format (itag 141/774) - is this a Premium account?",
  );
  process.exit(1);
}
console.log(
  `${vd.title} — ${vd.author} | itag ${fmt.itag} (${fmt.bitrate} bps)`,
);

let url = fmt.url;
if (!url) {
  const cipher = new URLSearchParams(fmt.signatureCipher);
  const baseUrl = cipher.get("url");
  const sp = cipher.get("sp") || "sig";
  const nOrig = new URL(baseUrl).searchParams.get("n");
  const { sig, n } = descramble(assets.baseJs, cipher.get("s"), nOrig);
  const u = new URL(baseUrl);
  u.searchParams.set(sp, sig);
  if (n) u.searchParams.set("n", n);
  url = u.toString();
  console.log(`descrambled: sig ${sig.length} chars | n ${nOrig} -> ${n}`);
}

// download file
const u = new URL(url);
const clen = Number(u.searchParams.get("clen"));
const dur = Number(u.searchParams.get("dur"));
if (clen) u.searchParams.set("range", "0-" + (clen - 1));
const t0 = Date.now();
const buf = Buffer.from(
  await (await fetch(u, { headers: { "User-Agent": UA } })).arrayBuffer(),
);
const ext = String(fmt.mimeType).includes("mp4") ? "m4a" : "webm";
const safe = (vd.title || VID).replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
const out = process.argv[3] || `${safe} [${VID}] ${fmt.itag}.${ext}`;
writeFileSync(out, buf);
console.log(
  `wrote ${out} | ${buf.length} bytes${clen ? " of " + clen + (buf.length === clen ? " (complete)" : "") : ""}` +
    `${dur ? ` | ${Math.round(((clen || buf.length) * 8) / dur / 1000)} kbps` : ""} | ${Date.now() - t0} ms`,
);
}
