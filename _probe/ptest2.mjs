import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync(new URL("../frontend/data/session.json", import.meta.url)));
const VR_UA = "com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12; eureka-user Build/SQ3A.220605.009.A1) gzip";
const client = { clientName: "ANDROID_VR", clientVersion: "1.62.27", deviceMake: "Oculus", deviceModel: "Quest 3", androidSdkVersion: 32, osName: "Android", osVersion: "12", userAgent: VR_UA, hl: "en", gl: "US" };

async function call(videoId, withHtml5) {
  const body = { context: { client }, videoId, contentCheckOk: true, racyCheckOk: true };
  if (withHtml5) body.playbackContext = { contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" } };
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST", headers: { "Content-Type": "application/json", "User-Agent": VR_UA },
    body: JSON.stringify(body),
  });
  return res.json();
}

// reliability: different tracks, 6 calls, both with/without html5Preference
const vids = ["qOaqT7lfx2A", "oRXiXy9ZLW4", "qOaqT7lfx2A"];
for (const withH of [false, true]) {
  for (const v of vids) {
    const j = await call(v, withH);
    const f = (j.streamingData?.adaptiveFormats ?? []).filter((x) => x.mimeType?.includes("audio"));
    console.log(`html5=${withH} ${v}: ${j.playabilityStatus?.status} audio=${f.length}`);
  }
}

// byte-fetch test of the best m4a url
const j = await call("qOaqT7lfx2A", false);
const m4a = (j.streamingData?.adaptiveFormats ?? []).filter((x) => x.mimeType?.includes("mp4a")).sort((a, b) => b.bitrate - a.bitrate)[0];
console.log("\nbest m4a itag", m4a?.itag, "bitrate", m4a?.bitrate, "len", m4a?.contentLength);
const r = await fetch(m4a.url, { headers: { Range: "bytes=0-100000" } });
console.log("byte fetch:", r.status, r.headers.get("content-type"), "range:", r.headers.get("content-range"));
