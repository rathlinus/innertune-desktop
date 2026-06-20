import { readFileSync } from "node:fs";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
let src=readFileSync("base.js","utf8");
const O=JSON.parse(readFileSync("oracle.json","utf8"));
function matchBrace(s,open){let d=0;for(let i=open;i<s.length;i++){const c=s[i];if(c==="{")d++;else if(c==="}"){d--;if(!d)return i+1;}}return -1;}
{ const a=src.indexOf("var T6={SR:function"); const ob=src.indexOf("{",a); const end=matchBrace(src,ob);
  src=src.slice(0,end)+";globalThis.__ev=function(_n){try{return eval(_n)}catch(e){return ''+e}};"+src.slice(end); }
function makeStub(){const f=function(){return stub;};const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}});return stub;}
const ctx={navigator:{userAgent:"Mozilla/5.0 Chrome/149",platform:"Win32",languages:["de"],language:"de"},location:{href:"https://music.youtube.com/",protocol:"https:",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(s)=>Buffer.from(s,"binary").toString("base64"),atob:(s)=>Buffer.from(s,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{vm.runInContext(src,ctx,{timeout:8000});}catch(e){console.log("run threw:",e.message);}
const ev=ctx.__ev;
const Q=String("rawS").length; // dummy
const S=JSON.stringify(O.rawS), N=JSON.stringify(O.rawN);
// sanity: sig pipeline
console.log("sig pipeline ty(41,7221,EC(40,4766,S)):", ev(`ty(41,7221,EC(40,4766,${S}))`), " expect:",O.sig);
console.log("EC(40,4766,S) alone:", ev(`EC(40,4766,${S})`));
console.log("");
console.log("n oracle rawN:",O.rawN,"capN:",O.capN);
for(let M=19;M<=26;M++){
  const k=7726^M;
  const r1=ev(`EC(${M},${k},${N})`);
  const r2=ev(`ty(41,7221,EC(${M},${k},${N}))`);
  console.log(`M=${M} k=${k}  EC=>${JSON.stringify(r1)}  tyEC=>${JSON.stringify(r2)}`);
}
