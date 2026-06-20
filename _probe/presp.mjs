function connect(ws){ const sock=new WebSocket(ws); let id=0; const pend=new Map();
  sock.addEventListener("message",e=>{const m=JSON.parse(String(e.data));if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);}});
  const ready=new Promise((res,rej)=>{sock.addEventListener("open",res);sock.addEventListener("error",()=>rej(new Error("ws")));});
  return { ready, call:(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pend.set(i,{resolve,reject});sock.send(JSON.stringify({id:i,method,params}));}), close:()=>sock.close() }; }
async function ev(call,e){const r=await call("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true,timeout:15000});if(r.exceptionDetails)return"EXC:"+JSON.stringify(r.exceptionDetails).slice(0,300);return r.result.value;}
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube"));
const c=connect(page.webSocketDebuggerUrl); await c.ready; await c.call("Runtime.enable");
console.log(await ev(c.call,`(function(){var p=document.getElementById('movie_player');var r=p.getPlayerResponse&&p.getPlayerResponse();var f=(r&&r.streamingData&&r.streamingData.adaptiveFormats||[]).filter(x=>String(x.mimeType).includes('audio'));return JSON.stringify(f.map(x=>({itag:x.itag,q:x.audioQuality,br:x.bitrate,cipher:!!x.signatureCipher,url:!!x.url})));})()`));
console.log("hasAudioConfig:", await ev(c.call,`(function(){var p=document.getElementById('movie_player');var r=p.getPlayerResponse&&p.getPlayerResponse();return JSON.stringify({sabr:!!(r&&r.streamingData&&r.streamingData.serverAbrStreamingUrl), keys:r&&r.streamingData?Object.keys(r.streamingData):[]});})()`));
c.close();
