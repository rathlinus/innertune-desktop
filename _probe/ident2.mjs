import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync("base.js","utf8");
const pr = JSON.parse(readFileSync("q_player.json","utf8"));
const f = pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
const sc = new URLSearchParams(f.signatureCipher);
const S = sc.get("s"); const N = new URL(sc.get("url")).searchParams.get("n");
function makeStub(){ const f=function(){return stub;}; const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}}); return stub; }
const navigator={userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/149.0.0.0 Safari/537.36",platform:"Win32",language:"de",languages:["de"],product:"Gecko",vendor:"Google Inc.",cookieEnabled:true,appVersion:"5.0"};
const ctx={navigator,location:{href:"https://music.youtube.com/",protocol:"https:",host:"music.youtube.com",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(s)=>Buffer.from(s,"binary").toString("base64"),atob:(s)=>Buffer.from(s,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{ vm.runInContext(src,ctx,{timeout:8000}); }catch(e){}
const yp=ctx._yt_player;
const allFns=Object.keys(yp).filter(k=>typeof yp[k]==="function");
console.log("total fns:", allFns.length);
const sigHits=[], nHits=[];
for(const k of allFns){
  let r; try{ r=yp[k](S); }catch{ continue; }
  if(typeof r==="string" && r!==S && r.length>=80) sigHits.push([k,r.length]);
}
for(const k of allFns){
  let r; try{ r=yp[k](N); }catch{ continue; }
  if(typeof r==="string" && r!==N && r.length>=10 && r.length<=40) nHits.push([k,r]);
}
console.log("SIG-ish (str,len>=80):", JSON.stringify(sigHits));
console.log("N-ish:", JSON.stringify(nHits));
