function connect(ws){ const sock=new WebSocket(ws); let id=0; const pend=new Map();
  sock.addEventListener("message",e=>{const m=JSON.parse(String(e.data));if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);}});
  const ready=new Promise((res,rej)=>{sock.addEventListener("open",res);sock.addEventListener("error",()=>rej(new Error("ws")));});
  return { ready, call:(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pend.set(i,{resolve,reject});sock.send(JSON.stringify({id:i,method,params}));}), close:()=>sock.close() }; }
async function ev(call,e){const r=await call("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true,timeout:20000});if(r.exceptionDetails)return"EXC:"+JSON.stringify(r.exceptionDetails).slice(0,200);return r.result.value;}
const fs=await import("node:fs");
const captured=JSON.parse(fs.readFileSync("captured_urls.json","utf8"));
const url140=captured["140"];
const cu=new URL(url140);
const sigOut = cu.searchParams.get("sig") || cu.searchParams.get("signature") || cu.searchParams.get("sig2");
const nOut = cu.searchParams.get("n");
console.log("captured 140: sigOut len", sigOut&&sigOut.length, "nOut", nOut);

const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube"));
const c=connect(page.webSocketDebuggerUrl); await c.ready; await c.call("Runtime.enable");
// get the in-browser 140 signatureCipher (raw s + original n)
const raw = await ev(c.call,`(function(){var p=document.getElementById('movie_player');var r=p.getPlayerResponse();var f=r.streamingData.adaptiveFormats.find(x=>x.itag===140);var sc=new URLSearchParams(f.signatureCipher);return JSON.stringify({s:sc.get('s'),sp:sc.get('sp'),u:sc.get('url')});})()`);
const j=JSON.parse(raw);
const sIn=j.s; const nIn=new URL(j.u).searchParams.get("n");
console.log("raw 140: sIn len", sIn.length, "sp", j.sp, "nIn", nIn);
// Now in-page: find function mapping sIn->sigOut and nIn->nOut
const expr=`(function(){
  var yp=window._yt_player||{}; var sIn=${JSON.stringify(sIn)}, sigOut=${JSON.stringify(sigOut)}, nIn=${JSON.stringify(nIn)}, nOut=${JSON.stringify(nOut)};
  var keys=Object.keys(yp).filter(k=>typeof yp[k]==='function');
  var sigHit=[], nHit=[];
  for(var k of keys){ var fn=yp[k];
    try{ if(fn(sIn)===sigOut) sigHit.push([k,'str']); }catch(e){}
    try{ var a=sIn.split(''); var r=fn(a); var o=Array.isArray(r)?r.join(''):(typeof r==='string'?r:a.join('')); if(o===sigOut) sigHit.push([k,'arr']); }catch(e){}
    try{ if(fn(nIn)===nOut) nHit.push([k,'str']); }catch(e){}
  }
  return JSON.stringify({sig:sigHit, n:nHit});
})()`;
console.log("EXACT MATCH:", await ev(c.call, expr));
c.close();
