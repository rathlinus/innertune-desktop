function connect(ws){ const sock=new WebSocket(ws); let id=0; const pend=new Map();
  sock.addEventListener("message",e=>{const m=JSON.parse(String(e.data));if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);}});
  const ready=new Promise((res,rej)=>{sock.addEventListener("open",res);sock.addEventListener("error",()=>rej(new Error("ws")));});
  return { ready, call:(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pend.set(i,{resolve,reject});sock.send(JSON.stringify({id:i,method,params}));}), close:()=>sock.close() }; }
async function ev(call,e){const r=await call("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true,timeout:20000});if(r.exceptionDetails)return"EXC:"+JSON.stringify(r.exceptionDetails).slice(0,200);return r.result.value;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube"));
const c=connect(page.webSocketDebuggerUrl); await c.ready; await c.call("Runtime.enable"); await c.call("Page.enable");
// navigate directly to settings playback page
await c.call("Page.navigate",{url:"https://music.youtube.com/settings"});
await wait(6000);
console.log("settings url:", await ev(c.call,"location.href"));
// look for audio quality option text
console.log("audio quality items:", await ev(c.call,`(function(){
  var txt=[...document.querySelectorAll('*')].map(e=>e.textContent).filter(Boolean);
  var hits=[...document.querySelectorAll('ytmusic-setting-single-option-menu-renderer, tp-yt-paper-item, .setting-item, ytmusic-setting-category-collection-renderer')];
  var out=[...new Set([...document.body.innerText.split('\n')].filter(l=>/audio|qualit|hoch|always|immer/i.test(l)))];
  return JSON.stringify(out.slice(0,20));
})()`));
c.close();
