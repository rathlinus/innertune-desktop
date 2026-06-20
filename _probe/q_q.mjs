const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube.com"));
const ws=new WebSocket(page.webSocketDebuggerUrl);
let id=0;const pend=new Map();
const cmd=(m,p)=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.addEventListener("message",e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
await new Promise(r=>ws.addEventListener("open",r));
const expr=`(()=>{
  const mp=document.getElementById('movie_player');
  const r={};
  if(mp){ r.methods=Object.keys(mp).filter(k=>typeof mp[k]==='function'&&/audio|quality|format|itag/i.test(k)); 
    try{r.audioFmt=mp.getAudioTrack&&mp.getAudioTrack();}catch(e){}
    try{r.stats=mp.getStatsForNerds&&mp.getStatsForNerds();}catch(e){r.statsErr=String(e);}
    try{r.qualLevels=mp.getAvailableQualityLevels&&mp.getAvailableQualityLevels();}catch(e){}
    try{r.playbackQuality=mp.getPlaybackQuality&&mp.getPlaybackQuality();}catch(e){}
  } else r.noMp=true;
  // localStorage audio settings
  r.ls={}; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); if(/audio|qual|stream/i.test(k)) r.ls[k]=localStorage.getItem(k).slice(0,80);}
  return JSON.stringify(r);
})()`;
const res=await cmd("Runtime.evaluate",{expression:expr,returnByValue:true});
console.log(JSON.stringify(JSON.parse(res.result.result.value),null,1));
ws.close();
