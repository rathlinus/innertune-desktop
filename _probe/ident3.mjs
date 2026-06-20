import { readFileSync } from "node:fs";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
const src = readFileSync("base.js","utf8");
const pr = JSON.parse(readFileSync("q_player.json","utf8"));
const f = pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
const sc = new URLSearchParams(f.signatureCipher);
const S = sc.get("s"); const N = new URL(sc.get("url")).searchParams.get("n");
function makeStub(){ const f=function(){return stub;}; const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}}); return stub; }
const navigator={userAgent:"Mozilla/5.0 Chrome/149.0.0.0",platform:"Win32",language:"de",languages:["de"],product:"Gecko",vendor:"Google Inc.",cookieEnabled:true,appVersion:"5.0"};
const ctx={navigator,location:{href:"https://music.youtube.com/",protocol:"https:",host:"music.youtube.com",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(s)=>Buffer.from(s,"binary").toString("base64"),atob:(s)=>Buffer.from(s,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{ vm.runInContext(src,ctx,{timeout:8000}); }catch(e){}
const yp=ctx._yt_player;
const allFns=Object.keys(yp).filter(k=>typeof yp[k]==="function");
const ms=(s)=>s.split("").sort().join("");
const msS=ms(S), msN=ms(N);
const sigHits=[], nHits=[];
for(const k of allFns){
  let r; try{ r=yp[k](S); }catch{ continue; }
  if(typeof r==="string" && r!==S){ const d=Math.abs(r.length-S.length); if(d<=4 && ms(r.replace(/[^A-Za-z0-9_\-]/g,""))===msS.replace(/[^A-Za-z0-9_\-]/g,"")) sigHits.push([k,r.length,r.slice(0,20)]); }
}
for(const k of allFns){
  let r; try{ r=yp[k](N); }catch{ continue; }
  if(typeof r==="string" && r!==N){ const d=Math.abs(r.length-N.length); if(d<=4 && ms(r)===msN) nHits.push([k,r]); }
}
console.log("SIG (char-multiset match):", JSON.stringify(sigHits));
console.log("N (char-multiset match):", JSON.stringify(nHits));

// --- source-based fingerprinting ---
const a1 = allFns.filter(k=>yp[k].length===1);
const bySize = a1.map(k=>[k, yp[k].toString().length]).sort((a,b)=>b[1]-a[1]);
console.log("\nLongest arity-1 fn sources:", JSON.stringify(bySize.slice(0,12)));
// sig fingerprint: short-ish body that splits the arg and calls a helper obj method, returns join
for(const k of a1){
  const b=yp[k].toString();
  if(/\[0\]/.test(b) && /%/.test(b) && b.length<2500 && /\bvar\b/.test(b) && /return/.test(b) && /\(""\)|\.join|\.reverse|\.splice|\.split/.test(b)){
    console.log("SIG-shape:", k, "len", b.length, b.slice(0,160));
  }
}
