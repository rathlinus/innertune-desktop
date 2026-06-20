import { readFileSync, writeFileSync } from "node:fs";
const CLIENT_ID="861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com";
const CLIENT_SECRET="SboVhoG9s0rNafixCSGGKXAT";
const dev=JSON.parse(readFileSync("oauth_dev.json","utf8"));
const VID=process.argv[2]||"lYBUbBu4W08";
const UA="com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 14) gzip";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
let tok=null; const deadline=Date.now()+dev.expires_in*1000; let interval=(dev.interval||5)*1000;
console.log("polling for authorization...");
while(Date.now()<deadline){
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,device_code:dev.device_code,grant_type:"urn:ietf:params:oauth:grant-type:device_code"})});
  const j=await r.json();
  if(j.access_token){ tok=j; break; }
  if(j.error==="authorization_pending"){ await sleep(interval); continue; }
  if(j.error==="slow_down"){ interval+=5000; await sleep(interval); continue; }
  console.log("token error:",JSON.stringify(j)); process.exit(1);
}
if(!tok){ console.log("timed out waiting for authorization"); process.exit(1); }
writeFileSync("oauth_token.json",JSON.stringify(tok,null,2));
console.log("AUTHORIZED. token type:",tok.token_type,"scope:",tok.scope);

const s=JSON.parse(readFileSync("../frontend/data/session.json","utf8").replace(/^﻿/,""));
const clients={
  ANDROID_VR:{clientName:"ANDROID_VR",clientVersion:"1.61.48",androidSdkVersion:34,cnum:28,deviceModel:"Quest 3"},
  ANDROID_MUSIC:{clientName:"ANDROID_MUSIC",clientVersion:"7.27.52",androidSdkVersion:34,cnum:21},
  ANDROID:{clientName:"ANDROID",clientVersion:"19.44.38",androidSdkVersion:34,cnum:3},
  IOS:{clientName:"IOS",clientVersion:"20.10.4",cnum:5},
  TVHTML5:{clientName:"TVHTML5",clientVersion:"7.20250101.00.00",cnum:7},
};
const fmt=(x)=>x?(x.url?"URL":(x.signatureCipher?"CIPHER":"?")):"-";
for(const [name,c] of Object.entries(clients)){
  const client={clientName:c.clientName,clientVersion:c.clientVersion,hl:"de",gl:"DE",visitorData:s.visitor_data};
  if(c.androidSdkVersion)client.androidSdkVersion=c.androidSdkVersion;
  if(c.deviceModel)client.deviceModel=c.deviceModel;
  try{
    const r=await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false",{method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${tok.access_token}`,"X-Goog-Visitor-Id":s.visitor_data,"X-Youtube-Client-Name":String(c.cnum),"X-Youtube-Client-Version":c.clientVersion,"User-Agent":UA},
      body:JSON.stringify({context:{client},videoId:VID,contentCheckOk:true,racyCheckOk:true})});
    const pr=await r.json();
    const af=pr.streamingData?.adaptiveFormats||[];
    const g=(it)=>af.find(f=>f.itag===it);
    const naud=af.filter(f=>String(f.mimeType).includes("audio")).length;
    console.log(name.padEnd(14),"status",pr.playabilityStatus?.status,"| premium?",!!pr.streamingData,"| 141",fmt(g(141)),"251",fmt(g(251)),"140",fmt(g(140)),"774",fmt(g(774)),"| naud",naud);
    if(g(141)&&g(141).url){ console.log("   *** 141 DIRECT URL ***", g(141).url.slice(0,90)); }
  }catch(e){ console.log(name.padEnd(14),"ERR",e.message); }
}
