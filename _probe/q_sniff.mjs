// Sniff what the live music.youtube.com player actually requests from googlevideo.
const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = targets.find(t=>t.type==="page" && t.url.includes("music.youtube.com"));
if(!page){ console.log("no music page"); process.exit(1); }
console.log("page:", page.url);
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id=0; const pend=new Map();
const cmd=(method,params)=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
const seen=new Map();
ws.addEventListener("message",e=>{
  const m=JSON.parse(e.data);
  if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);return;}
  if(m.method==="Network.requestWillBeSent"){
    const u=m.params.request.url;
    if(u.includes("googlevideo.com") || u.includes("videoplayback")){
      const url=new URL(u);
      const itag=url.searchParams.get("itag");
      const mime=url.searchParams.get("mime");
      const key=itag+"|"+m.params.request.method;
      if(!seen.has(key)){
        seen.set(key,1);
        console.log(`[${m.params.request.method}] itag=${itag} mime=${mime} hasN=${url.searchParams.has("n")} hasSig=${url.searchParams.has("sig")||url.searchParams.has("sig2")||url.searchParams.has("lsig")} host=${url.host}`);
        if(m.params.request.postData) console.log("   POST body bytes:", m.params.request.postData.length);
        console.log("   URL:", u.slice(0,260));
      }
    }
  }
});
await new Promise(r=>ws.addEventListener("open",r));
await cmd("Network.enable",{});
await cmd("Page.enable",{});

// force playback + a seek to provoke media fetches
await cmd("Runtime.evaluate",{expression:`(()=>{const v=document.querySelector('video'); if(!v) return 'no video'; v.muted=true; v.play&&v.play(); try{v.currentTime=Math.max(0,(v.currentTime||0)+5);}catch(e){} return 'playing '+v.src.slice(0,60);})()`,returnByValue:true}).then(r=>console.log("play:",r.result?.result?.value));

console.log("sniffing 9s...");
await new Promise(r=>setTimeout(r,9000));
console.log("distinct itag|method seen:", seen.size);
ws.close();
