function connect(ws){ const sock=new WebSocket(ws); let id=0; const pend=new Map();
  sock.addEventListener("message",e=>{const m=JSON.parse(String(e.data));if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);}});
  const ready=new Promise((res,rej)=>{sock.addEventListener("open",res);sock.addEventListener("error",()=>rej(new Error("ws")));});
  return { ready, call:(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pend.set(i,{resolve,reject});sock.send(JSON.stringify({id:i,method,params}));}), close:()=>sock.close() }; }
async function ev(call,e){const r=await call("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true,timeout:15000});if(r.exceptionDetails)return"EXC:"+JSON.stringify(r.exceptionDetails).slice(0,200);return r.result.value;}
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube"));
const c=connect(page.webSocketDebuggerUrl); await c.ready; await c.call("Runtime.enable");
console.log("mp methods:", await ev(c.call,`(function(){var p=document.getElementById('movie_player');if(!p)return 'no mp';return JSON.stringify(Object.getOwnPropertyNames(p).filter(k=>/audio|qual|format|track|setting/i.test(k)));})()`));
console.log("mp proto audio/qual:", await ev(c.call,`(function(){var p=document.getElementById('movie_player');if(!p)return 'no';var props=[];var o=p;while(o){props=props.concat(Object.getOwnPropertyNames(o));o=Object.getPrototypeOf(o);}return JSON.stringify([...new Set(props)].filter(k=>/audioquality|setaudio|getaudio|playbackquality|qualityrange|setplayback/i.test(k)));})()`));
console.log("localStorage qual keys:", await ev(c.call,`JSON.stringify(Object.keys(localStorage).filter(k=>/qual|audio|setting|pref/i.test(k)))`));
console.log("yt config audio:", await ev(c.call,`(function(){try{return JSON.stringify(Object.keys(window).filter(k=>/setting/i.test(k)))}catch(e){return ''+e}})()`));
c.close();
