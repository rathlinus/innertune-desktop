import { readFileSync } from "node:fs";
// Persistent CDP eval helper
function connect(ws){
  const sock=new WebSocket(ws); let id=0; const pend=new Map();
  sock.addEventListener("message",ev=>{ const m=JSON.parse(String(ev.data)); if(m.id&&pend.has(m.id)){ const{resolve,reject}=pend.get(m.id); pend.delete(m.id); m.error?reject(new Error(m.error.message)):resolve(m.result); } });
  const ready=new Promise((res,rej)=>{ sock.addEventListener("open",res); sock.addEventListener("error",()=>rej(new Error("ws err"))); });
  function call(method,params={}){ return new Promise((resolve,reject)=>{ const i=++id; pend.set(i,{resolve,reject}); sock.send(JSON.stringify({id:i,method,params})); }); }
  return { ready, call, close:()=>sock.close() };
}
async function evalExpr(call, expression){
  const r=await call("Runtime.evaluate",{ expression, returnByValue:true, awaitPromise:true, timeout:15000 });
  if(r.exceptionDetails) throw new Error("page exc: "+JSON.stringify(r.exceptionDetails).slice(0,300));
  return r.result.value;
}

const pr=JSON.parse(readFileSync("q_player.json","utf8"));
const f=pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
const sc=new URLSearchParams(f.signatureCipher);
const S=sc.get("s"); const N=new URL(sc.get("url")).searchParams.get("n");

const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(t=>t.type==="page"&&t.url.includes("music.youtube.com"));
const c=connect(page.webSocketDebuggerUrl);
await c.ready;
await c.call("Runtime.enable");

// First: does window._yt_player exist?
const probe=await evalExpr(c.call, `(function(){ var yp=window._yt_player; return { has:!!yp, keys: yp?Object.keys(yp).length:0, fns: yp?Object.keys(yp).filter(k=>typeof yp[k]==="function").length:0 }; })()`);
console.log("yt_player:", JSON.stringify(probe));

// Identify sig & n by permutation behaviour, IN the page
const expr = `(function(){
  var yp=window._yt_player||{}; var S=${JSON.stringify(S)}, N=${JSON.stringify(N)};
  var setS={}; for(var i=0;i<S.length;i++) setS[S[i]]=1;
  function ms(x){return x.split("").sort().join("");}
  var msS=ms(S), msN=ms(N);
  var sig=[], nfn=[];
  var keys=Object.keys(yp).filter(k=>typeof yp[k]==="function");
  for(var ki=0;ki<keys.length;ki++){ var k=keys[ki]; var fn=yp[k];
    // string-in
    try{ var r=fn(S); if(typeof r==="string"&&r!==S&&r.length>=98&&r.length<=104&&ms(r)===msS) sig.push([k,"str",r.length]); }catch(e){}
    // array-in (may mutate)
    try{ var a=S.split(""); var r2=fn(a); var out=Array.isArray(r2)?r2.join(""):(typeof r2==="string"?r2:a.join("")); if(out&&out!==S&&out.length>=98&&out.length<=104&&ms(out)===msS&&sig.filter(function(z){return z[0]===k}).length===0) sig.push([k,"arr",out.length]); }catch(e){}
    try{ var rn=fn(N); if(typeof rn==="string"&&rn!==N&&rn.length>=12&&rn.length<=24) nfn.push([k,rn]); }catch(e){}
  }
  return JSON.stringify({sig:sig, n:nfn});
})()`;
const out=await evalExpr(c.call, expr);
console.log("RESULT:", out);
c.close();
