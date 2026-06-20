function connect(ws){ const sock=new WebSocket(ws); let id=0; const pend=new Map(); const evs=[];
  sock.addEventListener("message",e=>{ const m=JSON.parse(String(e.data)); if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);} else if(m.method){ evs.push(m); } });
  const ready=new Promise((res,rej)=>{sock.addEventListener("open",res);sock.addEventListener("error",()=>rej(new Error("ws")));});
  return { ready, evs, call:(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pend.set(i,{resolve,reject});sock.send(JSON.stringify({id:i,method,params}));}), close:()=>sock.close() }; }
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube"));
const c=connect(page.webSocketDebuggerUrl); await c.ready;
await c.call("Network.enable"); await c.call("Runtime.enable");
// try to start playback
await c.call("Runtime.evaluate",{expression:`(function(){var v=document.querySelector('video'); if(v){v.muted=true; var p=v.play(); return 'play called';} return 'no video';})()`,returnByValue:true});
await wait(6000);
const media=c.evs.filter(m=>m.method==="Network.requestWillBeSent").map(m=>m.params.request.url).filter(u=>/googlevideo|videoplayback|sabr|initplayback|player\?|youtubei\/v1\/player/.test(u));
const seen=new Set();
for(const u of media){ const key=u.split("?")[0]; if(seen.has(key))continue; seen.add(key);
  const uu=new URL(u); console.log("REQ:", uu.host+uu.pathname, "| params:", [...uu.searchParams.keys()].filter(k=>["itag","pot","n","mime","sabr","ump","alr"].includes(k)).map(k=>k+"="+uu.searchParams.get(k).slice(0,18)).join(" "));
}
console.log("total media reqs:", media.length);
c.close();
