import { readFileSync } from "node:fs";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
const src = readFileSync("base.js","utf8");
const pr = JSON.parse(readFileSync("q_player.json","utf8"));

function makeStub(){ const f=function(){return stub;}; const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}}); return stub; }
const navigator={userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/149.0.0.0 Safari/537.36",platform:"Win32",language:"de",languages:["de"],product:"Gecko",vendor:"Google Inc.",cookieEnabled:true,appVersion:"5.0"};
const ctx={navigator,location:{href:"https://music.youtube.com/",protocol:"https:",host:"music.youtube.com",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(s)=>Buffer.from(s,"binary").toString("base64"),atob:(s)=>Buffer.from(s,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{ vm.runInContext(src,ctx,{timeout:8000}); }catch(e){}
const yp=ctx._yt_player;
const a1=Object.keys(yp).filter(k=>typeof yp[k]==="function"&&yp[k].length===1);

const ms=(s)=>s.split("").sort().join("");
const f141 = pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
const sc = new URLSearchParams(f141.signatureCipher);
const S=sc.get("s"), SP=sc.get("sp")||"sig", baseUrl=sc.get("url");
const N0 = new URL(baseUrl).searchParams.get("n");

// --- sig fn: arity-1, output is an alnum string of plausible sig length.
// (sig transform reverses/swaps/splices -> output may be SHORTER than input, chars are a subset.) ---
const okc=(x)=>/^[A-Za-z0-9_\-=.%]+$/.test(x);
const inS=(r)=>[...r].every(c=>S.includes(c));
const sigFns=[];
for(const k of a1){ let r; try{r=yp[k](S);}catch{continue;} if(typeof r==="string"&&r!==S&&r.length>=70&&r.length<=120&&okc(r)&&inS(r)) sigFns.push(k); }

// --- n fn: arity-1, output is string, similar length, NOT a permutation, alnum/_- ---
const nFns=[];
for(const k of a1){ let r; try{r=yp[k](N0);}catch{continue;} if(typeof r==="string"&&r!==N0&&r.length>=8&&r.length<=40&&okc(r)&&ms(r)!==ms(N0)) nFns.push([k,r]); }

console.log("SIG fns:", sigFns);
console.log("N fns:", JSON.stringify(nFns));

// Build candidate URLs (every sig x n combo) and verify with a real Range request.
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
async function test(label,url){
  try{
    const res=await fetch(url,{headers:{Range:"bytes=0-99","User-Agent":UA}});
    console.log(label,"->",res.status,res.headers.get("content-type"),res.headers.get("content-length"));
    return res.status;
  }catch(e){ console.log(label,"-> ERR",e.message); return 0; }
}

for(const sk of sigFns){
  const sig=yp[sk](S);
  for(const [nk,nv] of (nFns.length?nFns:[["__none__",N0]])){
    const u=new URL(baseUrl);
    u.searchParams.set(SP,sig);
    u.searchParams.set("n",nv);
    const ok=await test(`sig=${sk} n=${nk}`,u.toString());
    if(ok===200||ok===206){ console.log("\n*** WORKING URL ***\n"+u.toString()); }
  }
}
