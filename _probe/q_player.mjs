import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const s = JSON.parse(readFileSync("../frontend/data/session.json","utf8").replace(/^﻿/,""));
const O = "https://music.youtube.com";
const VID = process.argv[2] || "qOaqT7lfx2A";
function auth(){ const sid=s.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/)[1]; const ts=Math.floor(Date.now()/1000);
  return `SAPISIDHASH ${ts}_${createHash("sha1").update(`${ts} ${sid} ${O}`).digest("hex")}`; }
const cl={ ...(s.context?.client??{}), clientName:"WEB_REMIX", clientVersion:s.clientVersion, hl:"de", gl:"DE", visitorData:s.visitor_data };
const res = await fetch(`${O}/youtubei/v1/player?prettyPrint=false&key=${s.apiKey}`, {
  method:"POST",
  headers:{ "Content-Type":"application/json", Cookie:s.cookie, Authorization:auth(), Origin:O, "X-Origin":O, Referer:O+"/",
    "X-Goog-AuthUser":"0", "X-Goog-Visitor-Id":s.visitor_data, "X-Youtube-Client-Name":"67", "X-Youtube-Client-Version":s.clientVersion,
    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36" },
  body: JSON.stringify({ context:{ client:cl }, videoId:VID,
    playbackContext:{ contentPlaybackContext:{ html5Preference:"HTML5_PREF_WANTS" } }, contentCheckOk:true, racyCheckOk:true }),
});
console.log("HTTP", res.status);
const pr = await res.json();
console.log("playability:", pr?.playabilityStatus?.status, pr?.playabilityStatus?.reason||"");
const fmts = pr?.streamingData?.adaptiveFormats ?? [];
console.log("jsUrl hint (playerConfig):", pr?.playerConfig ? "yes" : "no");
for (const f of fmts.filter(f=>String(f.mimeType).includes("audio"))){
  console.log(`itag ${f.itag}  br ${f.bitrate}  ${f.mimeType.split(";")[0]}  ${f.audioQuality||""}  ${f.url?"URL":(f.signatureCipher?"CIPHER":"?")}  loud=${f.loudnessDb??""}`);
}
writeFileSync("q_player.json", JSON.stringify(pr));
console.log("saved q_player.json");
