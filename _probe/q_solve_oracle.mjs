import { readFileSync } from "node:fs";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
const src=readFileSync("base.js","utf8");
const O=JSON.parse(readFileSync("oracle.json","utf8"));
function makeStub(){const f=function(){return stub;};const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}});return stub;}
const ctx={navigator:{userAgent:"Mozilla/5.0 Chrome/149",platform:"Win32",languages:["de"],language:"de"},location:{href:"https://music.youtube.com/",protocol:"https:",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(s)=>Buffer.from(s,"binary").toString("base64"),atob:(s)=>Buffer.from(s,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{vm.runInContext(src,ctx,{timeout:8000});}catch(e){}
const yp=ctx._yt_player;
const keys=Object.keys(yp);
console.log("_yt_player fns:",keys.filter(k=>typeof yp[k]==="function").length);
let found=[];
for(const k of keys){
  const fn=yp[k]; if(typeof fn!=="function")continue;
  // try as plain (s) call
  try{ if(fn(O.rawS)===O.sig){ found.push(k+"(s)"); } }catch{}
  // try (n) -> capN to also catch n fn
  try{ if(fn(O.rawN)===O.capN){ found.push(k+"(n!)"); } }catch{}
}
console.log("EXACT sig/n matches in _yt_player:", JSON.stringify(found));

// also scan nested: object props that are functions
let nestedFound=[];
for(const k of keys){ let o; try{o=yp[k];}catch{continue;} if(o&&typeof o==="object"){ for(const kk of Object.keys(o)){ let fn; try{fn=o[kk];}catch{continue;} if(typeof fn!=="function")continue;
  try{ if(fn(O.rawS)===O.sig) nestedFound.push(k+"."+kk+"(s)"); }catch{}
  try{ if(fn(O.rawN)===O.capN) nestedFound.push(k+"."+kk+"(n!)"); }catch{}
}}}
console.log("EXACT matches nested:", JSON.stringify(nestedFound));
