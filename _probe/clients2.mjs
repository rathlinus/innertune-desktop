import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const s = JSON.parse(readFileSync("../frontend/data/session.json","utf8").replace(/^﻿/,""));
const VID = "qOaqT7lfx2A";
function sapis(o){ const sid=s.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/)[1]; const ts=Math.floor(Date.now()/1000);
  return `SAPISIDHASH ${ts}_${createHash("sha1").update(`${ts} ${sid} ${o}`).digest("hex")}`; }
const c={ clientName:"ANDROID_MUSIC", clientVersion:"7.27.52", androidSdkVersion:34, osName:"Android", osVersion:"14", hl:"en", gl:"US" };
const body={ context:{ client:{...c, visitorData:s.visitor_data} }, videoId:VID, contentCheckOk:true, racyCheckOk:true };
const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", { method:"POST",
  headers:{ "Content-Type":"application/json", Origin:"https://www.youtube.com", Cookie:s.cookie, Authorization:sapis("https://www.youtube.com"),
    "X-Goog-AuthUser":"0", "X-Goog-Visitor-Id":s.visitor_data, "X-Youtube-Client-Name":"21", "X-Youtube-Client-Version":c.clientVersion,
    "User-Agent":"com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 14) gzip" },
  body: JSON.stringify(body) });
console.log("HTTP", r.status);
const j = await r.json();
console.log("playability:", JSON.stringify(j.playabilityStatus)?.slice(0,300));
console.log("has streamingData:", !!j.streamingData, "error:", JSON.stringify(j.error)?.slice(0,200));
