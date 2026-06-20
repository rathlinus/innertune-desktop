import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const s=JSON.parse(readFileSync("../frontend/data/session.json","utf8").replace(/^﻿/,""));
const O="https://www.youtube.com", OM="https://music.youtube.com";
const VID=process.argv[2]||"lYBUbBu4W08";
const sid=s.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/)[1];
function auth(origin){const ts=Math.floor(Date.now()/1000);return `SAPISIDHASH ${ts}_${createHash("sha1").update(`${ts} ${sid} ${origin}`).digest("hex")}`;}
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

const clients={
  ANDROID_MUSIC:{clientName:"ANDROID_MUSIC",clientVersion:"7.27.52",androidSdkVersion:34,cnum:21,os:"Android"},
  IOS_MUSIC:{clientName:"IOS_MUSIC",clientVersion:"7.27.5",cnum:26,os:"iOS"},
  ANDROID:{clientName:"ANDROID",clientVersion:"19.44.38",androidSdkVersion:34,cnum:3,os:"Android"},
  IOS:{clientName:"IOS",clientVersion:"20.10.4",cnum:5,os:"iOS"},
  TVHTML5:{clientName:"TVHTML5_SIMPLY_EMBEDDED_PLAYER",clientVersion:"2.0",cnum:85,os:"TV"},
  MWEB:{clientName:"MWEB",clientVersion:"2.20250101.00.00",cnum:2,os:"web"},
};
for(const [name,c] of Object.entries(clients)){
  const client={clientName:c.clientName,clientVersion:c.clientVersion,hl:"de",gl:"DE",visitorData:s.visitor_data};
  if(c.androidSdkVersion)client.androidSdkVersion=c.androidSdkVersion;
  const body={context:{client},videoId:VID,contentCheckOk:true,racyCheckOk:true};
  try{
    const r=await fetch(`${O}/youtubei/v1/player?prettyPrint=false`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:s.cookie,Authorization:auth(O),Origin:O,"X-Origin":O,"X-Goog-AuthUser":"0","X-Goog-Visitor-Id":s.visitor_data,"X-Youtube-Client-Name":String(c.cnum),"X-Youtube-Client-Version":c.clientVersion,"User-Agent":UA},body:JSON.stringify(body)});
    const pr=await r.json();
    const af=pr.streamingData?.adaptiveFormats||[];
    const a141=af.find(f=>f.itag===141), a251=af.find(f=>f.itag===251), a774=af.find(f=>f.itag===774);
    const fmt=(x)=>x?(x.url?"URL":(x.signatureCipher?"CIPHER":"?")):"-";
    console.log(name.padEnd(14),"status",pr.playabilityStatus?.status,"| 141",fmt(a141),"251",fmt(a251),"774",fmt(a774),"| audioFmts",af.filter(f=>String(f.mimeType).includes("audio")).length);
  }catch(e){ console.log(name.padEnd(14),"ERR",e.message); }
}
