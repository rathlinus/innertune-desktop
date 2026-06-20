import { writeFileSync } from "node:fs";
const VID=process.argv[2]||"lYBUbBu4W08";
const TARGET=Number(process.argv[3]||3);
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube.com"));
const ws=new WebSocket(page.webSocketDebuggerUrl);
let id=0;const pend=new Map();
const cmd=(m,p)=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
const grabs=[];
ws.addEventListener("message",e=>{const m=JSON.parse(e.data);
  if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);return;}
  if(m.method==="Network.requestWillBeSent"){const u=m.params.request.url;
    if(/videoplayback/.test(u)){const itag=new URL(u).searchParams.get("itag");
      if(!grabs.find(g=>g.itag===itag))grabs.push({itag,url:u});}}
});
await new Promise(r=>ws.addEventListener("open",r));
await cmd("Network.enable",{});
// set the audio quality setting, confirm
const setRes=await cmd("Runtime.evaluate",{expression:`(()=>{const mp=document.getElementById('movie_player');try{mp.setUserAudioQualitySetting(${TARGET});}catch(e){return 'setErr '+e.message;}return 'set->'+mp.getUserAudioQualitySetting()+' paygated='+JSON.stringify(mp.getPaygatedAudioQualityData?mp.getPaygatedAudioQualityData():null);})()`,returnByValue:true});
console.log("setting:",setRes.result?.result?.value);
// fresh navigate so format selection re-runs with the setting
await cmd("Page.navigate",{url:`https://music.youtube.com/watch?v=${VID}`});
await new Promise(r=>setTimeout(r,5000));
for(let i=0;i<4;i++){
  const r=await cmd("Runtime.evaluate",{expression:`(()=>{const v=document.querySelector('video');const mp=document.getElementById('movie_player');if(v){v.muted=true;try{v.play()}catch(e){};try{v.currentTime=(v.currentTime||0)+40}catch(e){}}let cod='';try{cod=mp.getStatsForNerds().codecs}catch(e){}return 'codecs='+cod;})()`,returnByValue:true});
  console.log("t"+i,r.result?.result?.value);
  await new Promise(r=>setTimeout(r,2500));
}
ws.close();
console.log("itags fetched:",grabs.map(g=>g.itag).join(","));
const hq=grabs.find(g=>["141","774","251"].includes(g.itag));
if(!hq){console.log("no HQ itag captured");process.exit(0);}
console.log("HQ itag:",hq.itag);
writeFileSync("grab_hq.json",JSON.stringify(hq,null,1));
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const u=new URL(hq.url); u.searchParams.delete("ump"); u.searchParams.delete("srfvp");
const r=await fetch(u,{headers:{Range:"bytes=0-300000","User-Agent":UA}});
const buf=Buffer.from(await r.arrayBuffer());
console.log("RAW fetch ->",r.status,r.headers.get("content-type"),"clen",r.headers.get("content-length"),"got",buf.length,"hdr",buf.slice(0,8).toString("hex"));
