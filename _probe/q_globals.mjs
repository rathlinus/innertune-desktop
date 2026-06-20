import { readFileSync } from "node:fs";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
const src=readFileSync("base.js","utf8");
const pr=JSON.parse(readFileSync("q_player.json","utf8"));
const f=pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
const sc=new URLSearchParams(f.signatureCipher);
const S=sc.get("s"), N=new URL(sc.get("url")).searchParams.get("n");
function makeStub(){const f=function(){return stub;};const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}});return stub;}
const ctx={navigator:{userAgent:"Mozilla/5.0 Chrome/149",platform:"Win32",languages:["de"],language:"de"},location:{href:"https://music.youtube.com/",protocol:"https:",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(s)=>Buffer.from(s,"binary").toString("base64"),atob:(s)=>Buffer.from(s,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{vm.runInContext(src,ctx,{timeout:8000});}catch(e){console.log("THREW",e.message);}
const keys=Object.getOwnPropertyNames(ctx);
console.log("total global keys:",keys.length);
const topFns=keys.filter(k=>{try{return typeof ctx[k]==="function";}catch{return false;}});
console.log("global functions:",topFns.length, topFns.slice(0,60).join(","));
// test every global function (any arity) on S and N
const inS=(r)=>typeof r==="string"&&[...r].every(c=>S.includes(c));
for(const k of topFns){
  let r; try{r=ctx[k](S);}catch{continue;}
  if(typeof r==="string"&&r!==S&&r.length>=70&&r.length<=120&&inS(r)) console.log("SIG-like global:",k,"->",r.slice(0,30),"len",r.length);
}
console.log("--- objects holding many fns ---");
for(const k of keys){ let o; try{o=ctx[k];}catch{continue;} if(o&&typeof o==="object"){ const fns=Object.keys(o).filter(kk=>{try{return typeof o[kk]==="function";}catch{return false;}}); if(fns.length>=10) console.log(k,"has",fns.length,"fns"); } }
