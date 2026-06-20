import { writeFileSync } from "node:fs";
const VID=process.argv[2]||"lYBUbBu4W08";
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube.com"));
const ws=new WebSocket(page.webSocketDebuggerUrl);
let id=0;const pend=new Map();
const cmd=(m,p)=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
let capSig=null;
ws.addEventListener("message",e=>{const m=JSON.parse(e.data);
  if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);return;}
  if(m.method==="Network.requestWillBeSent"){const u=m.params.request.url;
    if(/videoplayback/.test(u)&&new URL(u).searchParams.get("itag")==="141"&&!capSig){const q=new URL(u).searchParams;capSig={sig:q.get("sig"),n:q.get("n"),lsig:q.get("lsig")};}}
});
await new Promise(r=>ws.addEventListener("open",r));
await cmd("Network.enable",{});
await cmd("Page.navigate",{url:`https://music.youtube.com/watch?v=${VID}`});
await new Promise(r=>setTimeout(r,5000));
// force high quality + read the player response s/n for itag 141
const rd=await cmd("Runtime.evaluate",{expression:`(()=>{const mp=document.getElementById('movie_player');try{mp.setUserAudioQualitySetting(3)}catch(e){}
  const pr=mp.getPlayerResponse();const f=pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
  const sc=new URLSearchParams(f.signatureCipher);
  return JSON.stringify({rawS:sc.get('s'),sp:sc.get('sp'),rawN:new URL(sc.get('url')).searchParams.get('n'),vid:pr.videoDetails.videoId});})()`,returnByValue:true});
const meta=JSON.parse(rd.result.result.value);
// provoke 141 fetch
for(let i=0;i<4&&!capSig;i++){
  await cmd("Runtime.evaluate",{expression:`(()=>{const v=document.querySelector('video');if(v){v.muted=true;try{v.play()}catch(e){};try{v.currentTime=(v.currentTime||0)+40}catch(e){}}return 1;})()`,returnByValue:true});
  await new Promise(r=>setTimeout(r,2500));
}
ws.close();
console.log("vid:",meta.vid,"sp:",meta.sp);
console.log("rawS  ("+meta.rawS.length+"):",meta.rawS);
console.log("capSig("+(capSig?capSig.sig.length:0)+"):",capSig&&capSig.sig);
console.log("rawN:",meta.rawN,"-> capN:",capSig&&capSig.n);
if(capSig){
  const ms=x=>x.split("").sort().join("");
  console.log("sig is permutation of s?:", ms(meta.rawS)===ms(capSig.sig));
  writeFileSync("oracle.json",JSON.stringify({rawS:meta.rawS,sig:capSig.sig,rawN:meta.rawN,capN:capSig.n,sp:meta.sp},null,1));
  console.log("saved oracle.json");
}
