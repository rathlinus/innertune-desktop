// Confirm ANDROID_VR + visitorData is reliable under repeat, and that a
// returned URL actually streams audio bytes via HTTP Range.
import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync(new URL("../frontend/data/session.json", import.meta.url), "utf8").replace(/^﻿/, ""));
const YT = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const VR = {
  clientName: "ANDROID_VR", clientVersion: "1.62.27", deviceMake: "Oculus", deviceModel: "Quest 3",
  androidSdkVersion: 32, osName: "Android", osVersion: "12",
  userAgent: "com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12; eureka-user Build/SQ3A.220605.009.A1) gzip",
  hl: "en", gl: "US", visitorData: s.visitor_data,
};
async function call(videoId) {
  const r = await fetch(YT, { method: "POST", headers: {
      "Content-Type": "application/json", Accept: "*/*", Origin: "https://www.youtube.com",
      "X-Youtube-Client-Name": "28", "X-Youtube-Client-Version": "1.62.27",
      "X-Goog-Visitor-Id": s.visitor_data, "User-Agent": VR.userAgent },
    body: JSON.stringify({ context: { client: VR }, videoId,
      playbackContext: { contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" } },
      contentCheckOk: true, racyCheckOk: true }) });
  const j = await r.json();
  const audio = (j.streamingData?.adaptiveFormats ?? []).filter((f) => f.mimeType?.includes("audio"));
  return { st: j.playabilityStatus?.status, audio, best: audio.sort((a,b)=>b.bitrate-a.bitrate)[0] };
}
// hammer the same id 8x in a row (the scenario that used to bot-wall)
let ok = 0;
let firstUrl = null;
for (let i = 0; i < 8; i++) {
  const o = await call("qOaqT7lfx2A");
  if (o.st === "OK" && o.best?.url) { ok++; firstUrl ??= o.best.url; }
  process.stdout.write(`${i+1}:${o.st === "OK" ? "OK" : o.st} `);
}
console.log(`\nrepeat reliability: ${ok}/8 OK`);
if (firstUrl) {
  const probe = await fetch(firstUrl, { headers: { Range: "bytes=0-200000" } });
  const buf = Buffer.from(await probe.arrayBuffer());
  console.log(`byte fetch: ${probe.status} ct=${probe.headers.get("content-type")} range=${probe.headers.get("content-range")} got=${buf.length}B`);
}
