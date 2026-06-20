import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const s = JSON.parse(readFileSync("../frontend/data/session.json","utf8").replace(/^﻿/,""));
const VID = process.argv[2] || "qOaqT7lfx2A";
const O = "https://music.youtube.com";
function sapis(origin){ const sid=s.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/)[1]; const ts=Math.floor(Date.now()/1000);
  return `SAPISIDHASH ${ts}_${createHash("sha1").update(`${ts} ${sid} ${origin}`).digest("hex")}`; }

const CLIENTS = {
  ANDROID_MUSIC: { clientName:"ANDROID_MUSIC", clientVersion:"7.27.52", androidSdkVersion:34, osName:"Android", osVersion:"14", hl:"en", gl:"US",
    ua:"com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 14) gzip", cnum:21 },
  IOS_MUSIC: { clientName:"IOS_MUSIC", clientVersion:"7.27.1", deviceMake:"Apple", deviceModel:"iPhone16,2", osName:"iOS", osVersion:"17.5.1.21F90", hl:"en", gl:"US",
    ua:"com.google.ios.youtubemusic/7.27.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)", cnum:26 },
  ANDROID: { clientName:"ANDROID", clientVersion:"19.29.37", androidSdkVersion:34, osName:"Android", osVersion:"14", hl:"en", gl:"US",
    ua:"com.google.android.youtube/19.29.37 (Linux; U; Android 14) gzip", cnum:3 },
  IOS: { clientName:"IOS", clientVersion:"19.29.1", deviceMake:"Apple", deviceModel:"iPhone16,2", osName:"iOS", osVersion:"17.5.1.21F90", hl:"en", gl:"US",
    ua:"com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)", cnum:5 },
};

async function test(name, c, { auth }){
  const body = { context:{ client:{ ...c, visitorData:s.visitor_data } }, videoId:VID,
    playbackContext:{ contentPlaybackContext:{ html5Preference:"HTML5_PREF_WANTS" } }, contentCheckOk:true, racyCheckOk:true };
  const headers = { "Content-Type":"application/json", Origin:"https://www.youtube.com", "X-Goog-Visitor-Id":s.visitor_data,
    "X-Youtube-Client-Name":String(c.cnum), "X-Youtube-Client-Version":c.clientVersion, "User-Agent":c.ua };
  if(auth){ headers.Cookie=s.cookie; headers.Authorization=sapis("https://www.youtube.com"); headers["X-Goog-AuthUser"]="0"; }
  let pr;
  try { pr = await (await fetch(`https://www.youtube.com/youtubei/v1/player?prettyPrint=false`, { method:"POST", headers, body:JSON.stringify(body) })).json(); }
  catch(e){ console.log(name, auth?"+auth":"-auth", "FETCH ERR", e.message); return; }
  const st = pr?.playabilityStatus?.status;
  const fmts = (pr?.streamingData?.adaptiveFormats??[]).filter(f=>String(f.mimeType).includes("audio"));
  const f141 = fmts.find(f=>f.itag===141), f774=fmts.find(f=>f.itag===774);
  const tag=(f)=> f? (f.url?"URL":(f.signatureCipher?"CIPHER":"?")) : "absent";
  console.log(`${name} ${auth?"+auth":"-auth"} | ${st} | itags:[${fmts.map(f=>f.itag).join(",")}] | 141:${tag(f141)} 774:${tag(f774)}`);
}
for(const [n,c] of Object.entries(CLIENTS)){ await test(n,c,{auth:false}); await test(n,c,{auth:true}); }
