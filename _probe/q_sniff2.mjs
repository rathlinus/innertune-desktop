const VID=process.argv[2]||"qOaqT7lfx2A";
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube.com"));
const ws=new WebSocket(page.webSocketDebuggerUrl);
let id=0;const pend=new Map();
const cmd=(m,p)=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
const seen=new Map();
ws.addEventListener("message",e=>{
  const m=JSON.parse(e.data);
  if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);return;}
  if(m.method==="Network.requestWillBeSent"){
    const u=m.params.request.url;
    if(/googlevideo\.com|videoplayback/.test(u)){
      const url=new URL(u);const itag=url.searchParams.get("itag");const meth=m.params.request.method;
      const key=itag+"|"+meth;
      if(!seen.has(key)){seen.set(key,1);
        console.log(`[${meth}] itag=${itag} n=${url.searchParams.get("n")} sig?=${url.searchParams.has("sig")} lsig?=${url.searchParams.has("lsig")} pot?=${url.searchParams.has("pot")} body=${m.params.request.postData?m.params.request.postData.length:0}`);
        console.log("   "+u.slice(0,230));
      }
    }
  }
});
await new Promise(r=>ws.addEventListener("open",r));
await cmd("Network.enable",{});
await cmd("Page.enable",{});
await cmd("Page.navigate",{url:`https://music.youtube.com/watch?v=${VID}`});
await new Promise(r=>setTimeout(r,4000));
// try to start playback: unmute-safe play + click play button
for(let i=0;i<3;i++){
  await cmd("Runtime.evaluate",{expression:`(()=>{const v=document.querySelector('video');if(v){v.muted=true;try{v.play()}catch(e){}}const b=document.querySelector('#play-pause-button,tp-yt-paper-icon-button#play-pause-button,.ytp-play-button');if(b)b.click();return v?('v src='+(v.currentSrc||v.src).slice(0,40)+' paused='+v.paused):'no video';})()`,returnByValue:true}).then(r=>console.log("t"+i,":",r.result?.result?.value));
  await new Promise(r=>setTimeout(r,3000));
}
console.log("distinct seen:",seen.size);
ws.close();
