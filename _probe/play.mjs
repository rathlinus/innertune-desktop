function connect(ws){ const sock=new WebSocket(ws); let id=0; const pend=new Map(); const evs=[];
  sock.addEventListener("message",e=>{ const m=JSON.parse(String(e.data)); if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);} else if(m.method){evs.push(m);} });
  const ready=new Promise((res,rej)=>{sock.addEventListener("open",res);sock.addEventListener("error",()=>rej(new Error("ws")));});
  return { ready, evs, call:(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pend.set(i,{resolve,reject});sock.send(JSON.stringify({id:i,method,params}));}), close:()=>sock.close() }; }
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function ev(call,e){const r=await call("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true,timeout:15000});if(r.exceptionDetails)return"EXC:"+JSON.stringify(r.exceptionDetails).slice(0,150);return r.result.value;}
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube"));
const c=connect(page.webSocketDebuggerUrl); await c.ready;
await c.call("Network.enable"); await c.call("Runtime.enable");
console.log("consent/dialogs:", await ev(c.call,"JSON.stringify([...document.querySelectorAll('tp-yt-paper-dialog,ytmusic-you-there-renderer,[role=dialog]')].map(d=>d.tagName).slice(0,5))"));
console.log("playBtn:", await ev(c.call,"!!document.querySelector('#play-pause-button, .play-pause-button, ytmusic-play-button-renderer')"));
// use the player API directly
console.log("api play:", await ev(c.call,`(function(){var pe=document.querySelector('ytmusic-player') ; var v=document.querySelector('video'); if(v){v.muted=true;} var app=document.querySelector('ytmusic-app'); try{ var pb=document.querySelector('#movie_player'); if(pb&&pb.playVideo){pb.playVideo(); return 'movie_player.playVideo';}}catch(e){return 'err '+e} if(v){v.play&&v.play(); return 'video.play';} return 'none';})()`));
await wait(8000);
console.log("video state:", await ev(c.call,"(function(){var v=document.querySelector('video');return v?JSON.stringify({rs:v.readyState,ns:v.networkState,ct:v.currentTime,paused:v.paused,err:v.error&&v.error.code,src:(v.src||'').slice(0,40)}):'no video';})()"));
const reqs=c.evs.filter(m=>m.method==="Network.requestWillBeSent").map(m=>m.params.request.url);
const media=reqs.filter(u=>/googlevideo|videoplayback|initplayback/.test(u));
console.log("media reqs:", media.length);
const seen=new Set();
for(const u of media){const uu=new URL(u);const k=uu.pathname;if(seen.has(k))continue;seen.add(k);console.log(" ", uu.host.split(".")[0]+uu.pathname, "itag="+(uu.searchParams.get("itag")||"-"), "pot="+(uu.searchParams.get("pot")?"Y":"-"), "n="+(uu.searchParams.get("n")||"-").slice(0,12), "ump="+(uu.searchParams.get("ump")||"-"), "sabr="+(uu.searchParams.get("sabr")||"-"));}
c.close();
