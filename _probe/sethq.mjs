function connect(ws){ const sock=new WebSocket(ws); let id=0; const pend=new Map(); const evs=[];
  sock.addEventListener("message",e=>{const m=JSON.parse(String(e.data));if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);}else if(m.method)evs.push(m);});
  const ready=new Promise((res,rej)=>{sock.addEventListener("open",res);sock.addEventListener("error",()=>rej(new Error("ws")));});
  return { ready, evs, call:(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pend.set(i,{resolve,reject});sock.send(JSON.stringify({id:i,method,params}));}), close:()=>sock.close() }; }
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function ev(call,e){const r=await call("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true,timeout:15000});if(r.exceptionDetails)return"EXC:"+JSON.stringify(r.exceptionDetails).slice(0,200);return r.result.value;}
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube"));
const c=connect(page.webSocketDebuggerUrl); await c.ready; await c.call("Runtime.enable"); await c.call("Network.enable");
console.log("current:", await ev(c.call,`(function(){var p=document.getElementById('movie_player');return JSON.stringify({user:p.getUserAudioQualitySetting&&p.getUserAudioQualitySetting(),state:p.getAudioQualitySettingState&&p.getAudioQualitySettingState(),paygated:p.getPaygatedAudioQualityData&&p.getPaygatedAudioQualityData(),hqa:p.hasHqaAudioTrack&&p.hasHqaAudioTrack()});})()`));
console.log("setHIGH:", await ev(c.call,`(function(){var p=document.getElementById('movie_player');var tries=['AUDIO_QUALITY_HIGH','HIGH','aqhi'];var res=[];for(var q of tries){try{p.setUserAudioQualitySetting(q);res.push(q+':ok');}catch(e){res.push(q+':'+e.message.slice(0,30));}}return res.join(' ');})()`));
// restart playback to apply
await ev(c.call,`(function(){var p=document.getElementById('movie_player');var v=document.querySelector('video');if(v)v.muted=true;try{p.seekTo&&p.seekTo(0);}catch(e){} p.playVideo&&p.playVideo();return 1;})()`);
await wait(9000);
const media=[...new Set(c.evs.filter(m=>m.method==="Network.requestWillBeSent").map(m=>m.params.request.url))].filter(u=>/videoplayback/.test(u));
const byItag={};for(const u of media){const it=new URL(u).searchParams.get("itag");if(it&&!byItag[it])byItag[it]=u;}
console.log("itags now:", Object.keys(byItag).join(","));
const fs=await import("node:fs"); fs.writeFileSync("captured_urls.json", JSON.stringify(byItag,null,1));
c.close();
