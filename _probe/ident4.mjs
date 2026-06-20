import { readFileSync } from "node:fs";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
const src = readFileSync("base.js","utf8");
const pr = JSON.parse(readFileSync("q_player.json","utf8"));
const f = pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
const sc = new URLSearchParams(f.signatureCipher);
const S = sc.get("s"); const N = new URL(sc.get("url")).searchParams.get("n");
function makeStub(){ const f=function(){return stub;}; const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}}); return stub; }
const navigator={userAgent:"Mozilla/5.0 Chrome/149",platform:"Win32",language:"de",languages:["de"],product:"Gecko",vendor:"Google Inc.",cookieEnabled:true,appVersion:"5.0"};
const ctx={navigator,location:{href:"https://music.youtube.com/",protocol:"https:",host:"music.youtube.com",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(s)=>Buffer.from(s,"binary").toString("base64"),atob:(s)=>Buffer.from(s,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{ vm.runInContext(src,ctx,{timeout:8000}); }catch(e){}
const yp=ctx._yt_player;
const allFns=Object.keys(yp).filter(k=>typeof yp[k]==="function");
const setS=new Set(S.split(""));
const hits=[];
for(const k of allFns){
  let arr=S.split(""); let r;
  try{ r=yp[k](arr); }catch{ continue; }
  // function may mutate in place (return undefined) or return array/string
  let out = Array.isArray(r)?r.join(""):(typeof r==="string"?r:(Array.isArray(arr)&&arr.join("")!==S?arr.join(""):null));
  if(out && out!==S && out.length>=98 && out.length<=104 && out.split("").every(c=>setS.has(c))){
    hits.push([k, out.length, out.slice(0,24)]);
  }
}
console.log("SIG (array-in):", JSON.stringify(hits));
// n: feed array too
const setN=new Set(N.split(""));
const nhits=[];
for(const k of allFns){
  let arr=N.split(""); let r;
  try{ r=yp[k](arr); }catch{ continue; }
  let out = Array.isArray(r)?r.join(""):(typeof r==="string"?r:(Array.isArray(arr)&&arr.join("")!==N?arr.join(""):null));
  if(out && out!==N && out.length>=14 && out.length<=22) nhits.push([k, out]);
}
console.log("N (array-in):", JSON.stringify(nhits));
