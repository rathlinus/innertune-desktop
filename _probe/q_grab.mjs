import { writeFileSync } from "node:fs";
const VID=process.argv[2]||"dQw4w9WgXcQ";
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube.com"));
const ws=new WebSocket(page.webSocketDebuggerUrl);
let id=0;const pend=new Map();
const cmd=(m,p)=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
const grabs=[];
ws.addEventListener("message",e=>{
  const m=JSON.parse(e.data);
  if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);return;}
  if(m.method==="Network.requestWillBeSent"){
    const u=m.params.request.url;
    if(/videoplayback/.test(u)){const url=new URL(u);const itag=url.searchParams.get("itag");
      if(["140","141","251","250","249","774"].includes(itag)&&!grabs.find(g=>g.itag===itag)){grabs.push({url:u,itag,method:m.params.request.method,body:m.params.request.postData||null});}
    }
  }
});
await new Promise(r=>ws.addEventListener("open",r));
await cmd("Network.enable",{});
await cmd("Page.navigate",{url:`https://music.youtube.com/watch?v=${VID}`});
await new Promise(r=>setTimeout(r,5000));
for(let i=0;i<4;i++){
  await cmd("Runtime.evaluate",{expression:`(()=>{const v=document.querySelector('video');if(!v)return'no v';v.muted=true;try{v.play()}catch(e){};try{v.currentTime=(v.currentTime||0)+30}catch(e){};return'paused='+v.paused+' t='+v.currentTime.toFixed(0);})()`,returnByValue:true}).then(r=>console.log("t"+i,r.result?.result?.value));
  await new Promise(r=>setTimeout(r,2500));
}
ws.close();
console.log("grabbed itags:",grabs.map(g=>g.itag).join(","));
if(!grabs.length)process.exit(0);
const g=grabs.find(x=>x.itag!=="140")||grabs[0];
console.log("testing itag",g.itag,"method",g.method,"bodyLen",g.body?g.body.length:0);
writeFileSync("grab.json",JSON.stringify(grabs,null,1));
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
async function show(lbl,p){try{const r=await p;console.log(lbl,"->",r.status,r.headers.get("content-type"),r.headers.get("content-length"));}catch(e){console.log(lbl,"-> ERR",e.message);}}
await show("GET Range ",fetch(g.url,{headers:{Range:"bytes=0-99","User-Agent":UA}}));
const u2=new URL(g.url);u2.searchParams.set("range","0-99");
await show("GET range=",fetch(u2,{headers:{"User-Agent":UA}}));
