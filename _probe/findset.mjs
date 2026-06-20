function connect(ws){ const sock=new WebSocket(ws); let id=0; const pend=new Map();
  sock.addEventListener("message",e=>{const m=JSON.parse(String(e.data));if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);}});
  const ready=new Promise((res,rej)=>{sock.addEventListener("open",res);sock.addEventListener("error",()=>rej(new Error("ws")));});
  return { ready, call:(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pend.set(i,{resolve,reject});sock.send(JSON.stringify({id:i,method,params}));}), close:()=>sock.close() }; }
async function ev(call,e){const r=await call("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true,timeout:15000});if(r.exceptionDetails)return"EXC:"+JSON.stringify(r.exceptionDetails).slice(0,200);return r.result.value;}
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube"));
const c=connect(page.webSocketDebuggerUrl); await c.ready; await c.call("Runtime.enable");
// Inspect the player's audio quality setter signature & try enum values, watching paygated + user
console.log(await ev(c.call,`(function(){
  var p=document.getElementById('movie_player');
  var log=[];
  // dump the AudioQuality-related getters
  log.push('state='+JSON.stringify(p.getAudioQualitySettingState()));
  // try string enums known from yt
  var vals=['AUDIO_QUALITY_HIGH','AUDIO_QUALITY_ALWAYS_HIGH', 4,3];
  for(var v of vals){ try{ p.setUserAudioQualitySetting(v);}catch(e){} }
  log.push('userAfter='+p.getUserAudioQualitySetting());
  log.push('paygated='+JSON.stringify(p.getPaygatedAudioQualityData()));
  return log.join(' | ');
})()`));
// inspect the function source to learn the enum it expects
console.log("setter src:", await ev(c.call,`(function(){var p=document.getElementById('movie_player');var f=p.setUserAudioQualitySetting;return f?f.toString().slice(0,260):'none';})()`));
console.log("getState src:", await ev(c.call,`(function(){var p=document.getElementById('movie_player');var f=p.getAudioQualitySettingState;return f?f.toString().slice(0,260):'none';})()`));
c.close();
