// fresh WEB_REMIX player call to get current cipher formats for a video
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const s=JSON.parse(readFileSync("../frontend/data/session.json","utf8").replace(/^﻿/,""));
const O="https://music.youtube.com";
const VID=process.argv[2]||"lYBUbBu4W08";
const ts=Math.floor(Date.now()/1000);
const sid=s.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/)[1];
const auth=`SAPISIDHASH ${ts}_${createHash("sha1").update(`${ts} ${sid} ${O}`).digest("hex")}`;
const cl={...(s.context?.client??{}),clientName:"WEB_REMIX",clientVersion:s.clientVersion,hl:"de",gl:"DE",visitorData:s.visitor_data};
const res=await fetch(`${O}/youtubei/v1/player?prettyPrint=false&key=${s.apiKey}`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:s.cookie,Authorization:auth,Origin:O,"X-Origin":O,Referer:O+"/","X-Goog-AuthUser":"0","X-Goog-Visitor-Id":s.visitor_data,"X-Youtube-Client-Name":"67","X-Youtube-Client-Version":s.clientVersion,"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"},body:JSON.stringify({context:{client:cl},videoId:VID,playbackContext:{contentPlaybackContext:{html5Preference:"HTML5_PREF_WANTS"}},contentCheckOk:true,racyCheckOk:true})});
const pr=await res.json();
writeFileSync("q_player.json",JSON.stringify(pr));
console.log("status",pr?.playabilityStatus?.status,"itag141?",!!pr.streamingData?.adaptiveFormats?.find(f=>f.itag===141));
