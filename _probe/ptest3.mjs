import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const s = JSON.parse(readFileSync(new URL("../frontend/data/session.json", import.meta.url)));
const ORIGIN = "https://music.youtube.com";
const VID = "qOaqT7lfx2A";

function sapisid() {
  const m = s.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/) || s.cookie.match(/(?:^|;\s*)__Secure-3PAPISID=([^;]+)/);
  return m[1];
}
function auth() {
  const ts = Math.floor(Date.now() / 1000);
  const h = createHash("sha1").update(`${ts} ${sapisid()} ${ORIGIN}`).digest("hex");
  return `SAPISIDHASH ${ts}_${h}`;
}

async function authedPlayer() {
  const client = { ...(s.context?.client ?? {}), clientName: "WEB_REMIX", clientVersion: s.clientVersion, hl: "de", gl: "DE", visitorData: s.visitor_data };
  const res = await fetch(`${ORIGIN}/youtubei/v1/player?prettyPrint=false&key=${s.apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "*/*", Cookie: s.cookie, Authorization: auth(),
      Origin: ORIGIN, "X-Origin": ORIGIN, Referer: ORIGIN + "/", "X-Goog-AuthUser": "0",
      "X-Goog-Visitor-Id": s.visitor_data, "X-Youtube-Client-Name": "67", "X-Youtube-Client-Version": s.clientVersion,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({ context: { client }, videoId: VID, contentCheckOk: true, racyCheckOk: true }),
  });
  return res.json();
}

const j = await authedPlayer();
console.log("status:", j.playabilityStatus?.status, j.playabilityStatus?.reason ?? "");
const fmts = j.streamingData?.adaptiveFormats ?? [];
const audio = fmts.filter((f) => f.mimeType?.includes("audio"));
console.log("audio formats:", audio.length);
for (const f of audio) {
  const hasUrl = !!f.url;
  const hasCipher = !!f.signatureCipher;
  const nParam = f.url ? new URL(f.url).searchParams.get("n") : (f.signatureCipher ? "in-cipher" : null);
  const hasPot = f.url ? new URL(f.url).searchParams.has("pot") : false;
  console.log(`  itag=${f.itag} ${f.mimeType?.split(";")[0]} br=${f.bitrate} url=${hasUrl} cipher=${hasCipher} n=${nParam} pot=${hasPot}`);
}
// try byte-fetch of a direct-url format if any
const direct = audio.find((f) => f.url);
if (direct) {
  const r = await fetch(direct.url, { headers: { Range: "bytes=0-50000" } });
  console.log("\ndirect byte-fetch itag", direct.itag, ":", r.status, r.headers.get("content-type"), r.headers.get("content-range"));
}
