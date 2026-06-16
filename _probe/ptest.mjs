import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync(new URL("../frontend/data/session.json", import.meta.url)));
const VID = "qOaqT7lfx2A";

async function player(label, { client, headers = {}, extra = {} }) {
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ context: { client }, videoId: VID, contentCheckOk: true, racyCheckOk: true, ...extra }),
    });
    const j = await res.json();
    const f = j.streamingData?.adaptiveFormats?.filter((x) => x.mimeType?.includes("audio")) ?? [];
    console.log(`[${label}] ${res.status} status=${j.playabilityStatus?.status} reason="${j.playabilityStatus?.reason ?? ""}" audioFmts=${f.length}` + (f[0] ? ` itag0=${f[0].itag} hasUrl=${!!f[0].url}` : ""));
  } catch (e) {
    console.log(`[${label}] ERR ${e}`);
  }
}

const VR_UA = "com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12; eureka-user Build/SQ3A.220605.009.A1) gzip";
const baseVR = { clientName: "ANDROID_VR", clientVersion: "1.62.27", deviceMake: "Oculus", deviceModel: "Quest 3", androidSdkVersion: 32, osName: "Android", osVersion: "12", userAgent: VR_UA, hl: "en", gl: "US" };

await player("vr-plain", { client: baseVR, headers: { "User-Agent": VR_UA } });
await player("vr+visitor", { client: { ...baseVR, visitorData: s.visitor_data }, headers: { "User-Agent": VR_UA, "X-Goog-Visitor-Id": s.visitor_data } });
await player("vr-newver", { client: { ...baseVR, clientVersion: "1.65.10", visitorData: s.visitor_data }, headers: { "User-Agent": VR_UA.replace("1.62.27", "1.65.10"), "X-Goog-Visitor-Id": s.visitor_data } });

// iOS music client (mediaconnect-free, often po_token-exempt)
const IOS = { clientName: "IOS", clientVersion: "20.10.4", deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.2.22D82", userAgent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)" };
await player("ios", { client: IOS, headers: { "User-Agent": IOS.userAgent } });

// TV HTML5 embedded
const TV = { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0", hl: "en", gl: "US" };
await player("tv-embed", { client: TV, extra: { playbackContext: { contentPlaybackContext: { signatureTimestamp: 20109 } } } });
