import { readFileSync } from "node:fs";
const tok=JSON.parse(readFileSync("oauth_token.json","utf8"));
const s=JSON.parse(readFileSync("../frontend/data/session.json","utf8").replace(/^﻿/,""));
const VID="lYBUbBu4W08";
async function probe(name,client,cnum,ua,extraHeaders={}){
  const r=await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false",{method:"POST",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${tok.access_token}`,"X-Goog-Visitor-Id":s.visitor_data,"X-Youtube-Client-Name":String(cnum),"X-Youtube-Client-Version":client.clientVersion,"User-Agent":ua,...extraHeaders},
    body:JSON.stringify({context:{client},videoId:VID,contentCheckOk:true,racyCheckOk:true})});
  const txt=await r.text();
  console.log(`\n=== ${name} (HTTP ${r.status}) ===`);
  console.log(txt.slice(0,350));
}
await probe("ANDROID_VR",{clientName:"ANDROID_VR",clientVersion:"1.61.48",androidSdkVersion:34,deviceMake:"Oculus",deviceModel:"Quest 3",osName:"Android",osVersion:"14",hl:"de",gl:"DE",visitorData:s.visitor_data},28,"com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 14; GB) gzip");
await probe("ANDROID",{clientName:"ANDROID",clientVersion:"19.44.38",androidSdkVersion:34,osName:"Android",osVersion:"14",hl:"de",gl:"DE",visitorData:s.visitor_data},3,"com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip");
// TVHTML5: does its 141 cipher need pot? check format + whether url base has pot/sps
await probe("TVHTML5",{clientName:"TVHTML5",clientVersion:"7.20250101.00.00",hl:"de",gl:"DE",visitorData:s.visitor_data},7,"Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko)");
