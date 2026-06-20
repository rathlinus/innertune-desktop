const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube.com"));
const ws=new WebSocket(page.webSocketDebuggerUrl);
let id=0;const pend=new Map();
const cmd=(m,p)=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener("message",e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
await new Promise(r=>ws.addEventListener("open",r));
const expr=`(()=>{
  const r={};
  const pr = window.ytcfg && (window.ytInitialPlayerResponse||null);
  // YTM stores response on the player; try several
  let resp = window.ytInitialPlayerResponse;
  const mp=document.getElementById('movie_player');
  try{ if(mp&&mp.getPlayerResponse) resp=mp.getPlayerResponse(); }catch(e){}
  if(resp&&resp.streamingData){
    const af=resp.streamingData.adaptiveFormats||[];
    r.audio = af.filter(f=>String(f.mimeType).includes('audio')).map(f=>({itag:f.itag,q:f.audioQuality,br:f.bitrate,ciph:!!f.signatureCipher,url:!!f.url,xtags:f.audioTrack?f.audioTrack.id:undefined}));
    r.isPremium = resp.playabilityStatus && resp.playabilityStatus.status;
  } else r.noResp=true;
  // membership / entitlement
  try{ r.acct = window.ytcfg.get('LOGGED_IN'); }catch(e){}
  return JSON.stringify(r);
})()`;
const res=await cmd("Runtime.evaluate",{expression:expr,returnByValue:true});
console.log(JSON.stringify(JSON.parse(res.result.result.value),null,1));
ws.close();
