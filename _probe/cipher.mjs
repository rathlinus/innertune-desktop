import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";

const js = readFileSync(new URL("./base.js", import.meta.url), "utf8");

// --- brace-balanced slice starting at the "{" found from `fromIndex` ---
function braceBlock(src, fromIndex) {
  const start = src.indexOf("{", fromIndex);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced");
}

// ---------------- signature decipher ----------------
function buildDecipher(src) {
  const namePatterns = [
    /\b([a-zA-Z0-9_$]+)\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)/,
    /(?:\b|[^a-zA-Z0-9_$])([a-zA-Z0-9_$]{2,})\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)/,
    /([a-zA-Z0-9_$]+)\s*&&\s*[a-zA-Z0-9_$]+\.set\([^,]+,\s*encodeURIComponent\(\s*([a-zA-Z0-9_$]+)\(/,
  ];
  let name = null;
  for (const re of namePatterns) {
    const m = src.match(re);
    if (m) { name = m[2] || m[1]; break; }
  }
  if (!name) throw new Error("decipher name not found");

  // function body
  const fnRe = new RegExp(
    `(?:function\\s+${name}|(?:var\\s+)?${name}\\s*=\\s*function)\\s*\\(\\s*a\\s*\\)\\s*\\{`
  );
  const fm = src.match(fnRe);
  if (!fm) throw new Error("decipher body not found for " + name);
  const body = braceBlock(src, fm.index);

  // helper object used inside (OBJ.method(a, n))
  const objName = body.match(/;([a-zA-Z0-9_$]+)\./)?.[1];
  if (!objName) throw new Error("helper obj not found");
  const objRe = new RegExp(`var\\s+${objName}\\s*=\\s*\\{`);
  const om = src.match(objRe);
  const objBody = braceBlock(src, om.index);

  const code = `var ${objName}=${objBody};var ${name}=function(a)${body};${name}(__sig__)`;
  return (sig) => vm.runInNewContext(code, { __sig__: sig });
}

// ---------------- n transform ----------------
function buildNsig(src) {
  const namePatterns = [
    /[a-zA-Z0-9_$]+\.get\("n"\)\)&&\([a-zA-Z0-9_$]+=([a-zA-Z0-9_$]+)(?:\[(\d+)\])?\(/,
    /\b([a-zA-Z0-9_$]+)\s*=\s*function\(\s*([a-zA-Z0-9_$])\s*\)\s*\{\s*var\s+\2=\2\.split\(/,
    /&&\([a-zA-Z0-9_$]+=([a-zA-Z0-9_$]+)(?:\[(\d+)\])?\([a-zA-Z0-9_$]+\)/,
  ];
  let name = null, idx = null;
  for (const re of namePatterns) {
    const m = src.match(re);
    if (m) { name = m[1]; idx = m[2]; break; }
  }
  if (!name) throw new Error("nsig name not found");

  // if name refers to an array element, resolve real fn name
  if (idx != null) {
    const arrRe = new RegExp(`var\\s+${name}\\s*=\\s*\\[([a-zA-Z0-9_$,\\s]+)\\]`);
    const am = src.match(arrRe);
    if (am) name = am[1].split(",").map((x) => x.trim())[Number(idx)];
  }

  const fnRe = new RegExp(
    `(?:function\\s+${name}|(?:var\\s+)?${name}\\s*=\\s*function)\\s*\\(\\s*([a-zA-Z0-9_$]+)\\s*\\)\\s*\\{`
  );
  const fm = src.match(fnRe);
  if (!fm) throw new Error("nsig body not found for " + name);
  const body = braceBlock(src, fm.index);
  const code = `var ${name}=function(a)${body.slice(body.indexOf("{"))};${name}(__n__)`;
  return (n) => vm.runInNewContext(code, { __n__: n });
}

const decipher = buildDecipher(js);
const nsig = buildNsig(js);
console.log("decipher('AAAAAA') ->", decipher("ABCDEF"));
console.log("nsig('abcdefgh') ->", nsig("abcdefgh"));

// ---- full pipeline: authed player -> decipher -> fetch bytes ----
const s = JSON.parse(readFileSync(new URL("../frontend/data/session.json", import.meta.url)));
const O = "https://music.youtube.com";
function auth() {
  const sid = s.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/)[1];
  const ts = Math.floor(Date.now() / 1000);
  return `SAPISIDHASH ${ts}_${createHash("sha1").update(`${ts} ${sid} ${O}`).digest("hex")}`;
}
const cl = { clientName: "WEB_REMIX", clientVersion: s.clientVersion, hl: "de", gl: "DE", visitorData: s.visitor_data };
const pr = await (await fetch(`${O}/youtubei/v1/player?key=${s.apiKey}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: s.cookie, Authorization: auth(), Origin: O, "X-Goog-Visitor-Id": s.visitor_data, "X-Youtube-Client-Name": "67", "X-Youtube-Client-Version": s.clientVersion },
  body: JSON.stringify({ context: { client: cl }, videoId: "qOaqT7lfx2A", contentCheckOk: true, racyCheckOk: true }),
})).json();

const fmt = (pr.streamingData?.adaptiveFormats ?? []).filter((f) => f.mimeType?.includes("audio")).sort((a, b) => b.bitrate - a.bitrate)[0];
const sc = new URLSearchParams(fmt.signatureCipher);
let url = new URL(sc.get("url"));
const sigParam = sc.get("sp") || "signature";
url.searchParams.set(sigParam, decipher(sc.get("s")));
const n = url.searchParams.get("n");
if (n) url.searchParams.set("n", nsig(n));
console.log("\nitag", fmt.itag, "bitrate", fmt.bitrate);
let r = await fetch(url, { headers: { Range: "bytes=0-100000" } });
console.log("WITHOUT pot:", r.status, r.headers.get("content-type"), r.headers.get("content-range"));
