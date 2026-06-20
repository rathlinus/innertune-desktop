function connect(ws){ const sock=new WebSocket(ws); let id=0; const pend=new Map();
  sock.addEventListener("message",ev=>{ const m=JSON.parse(String(ev.data)); if(m.id&&pend.has(m.id)){ const{resolve,reject}=pend.get(m.id); pend.delete(m.id); m.error?reject(new Error(m.error.message)):resolve(m.result);} });
  const ready=new Promise((res,rej)=>{ sock.addEventListener("open",res); sock.addEventListener("error",()=>rej(new Error("ws err"))); });
  return { ready, call:(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pend.set(i,{resolve,reject});sock.send(JSON.stringify({id:i,method,params}));}), close:()=>sock.close() }; }
async function ev(call,e){ const r=await call("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true,timeout:15000}); if(r.exceptionDetails)return "EXC:"+JSON.stringify(r.exceptionDetails).slice(0,200); return r.result.value; }
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube"));
const c=connect(page.webSocketDebuggerUrl); await c.ready; await c.call("Runtime.enable");
console.log("title:", await ev(c.call,"document.title"));
console.log("url:", await ev(c.call,"location.href"));
console.log("loggedIn:", await ev(c.call,"window.ytcfg&&ytcfg.get?ytcfg.get('LOGGED_IN'):'no ytcfg'"));
console.log("jsUrl:", await ev(c.call,"window.ytcfg&&ytcfg.get?ytcfg.get('PLAYER_JS_URL'):'?'"));
console.log("scripts with player:", await ev(c.call,"JSON.stringify([...document.scripts].map(s=>s.src).filter(s=>s.includes('player')||s.includes('base.js')))"));
console.log("globals w/ yt:", await ev(c.call,"JSON.stringify(Object.keys(window).filter(k=>/yt|player|_yt/i.test(k)).slice(0,40))"));
console.log("body len:", await ev(c.call,"document.body?document.body.innerText.length:0"));
console.log("body snippet:", String(await ev(c.call,"document.body?document.body.innerText.slice(0,200):''")).replace(/\n/g," "));
c.close();
