import { readFileSync } from "node:fs";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
let src=readFileSync("base.js","utf8");
const O=JSON.parse(readFileSync("oracle.json","utf8"));
function matchBrace(s,open){let d=0;for(let i=open;i<s.length;i++){const c=s[i];if(c==="{")d++;else if(c==="}"){d--;if(!d)return i+1;}}return -1;}
// inject eval-portal right after T6 (IIFE top-level scope)
{ const a=src.indexOf("var T6={SR:function"); const ob=src.indexOf("{",a); const end=matchBrace(src,ob);
  src=src.slice(0,end)+";globalThis.__ev=function(_n){try{return eval(_n)}catch(e){return undefined}};"+src.slice(end); }
function makeStub(){const f=function(){return stub;};const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}});return stub;}
const ctx={navigator:{userAgent:"Mozilla/5.0 Chrome/149",platform:"Win32",languages:["de"],language:"de"},location:{href:"https://music.youtube.com/",protocol:"https:",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(s)=>Buffer.from(s,"binary").toString("base64"),atob:(s)=>Buffer.from(s,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{vm.runInContext(src,ctx,{timeout:8000});}catch(e){console.log("run threw:",e.message);}
const ev=ctx.__ev;
console.log("portal works? typeof ty =", ev&&ev("typeof ty"), " T6 keys=", ev&&ev("T6&&Object.keys(T6)"));
if(!ev){process.exit(1);}
// collect candidate 1-arg function names from source
const names=new Set();
const re=/\b([A-Za-z0-9$_]{1,5})=function\(([A-Za-z0-9$_]+)\)\{/g; let m;
while((m=re.exec(src))) names.add(m[1]);
console.log("candidate 1-arg fn names:", names.size);
const hits=[];
for(const nm of names){
  let f; try{ f=ev(nm); }catch{ continue; }
  if(typeof f!=="function"||f.length!==1) continue;
  let r; try{ r=f(O.rawN); }catch{ continue; }
  if(r===O.capN){ hits.push(nm+" EXACT"); continue; }
  if(typeof r==="string"&&r!==O.rawN&&/^[A-Za-z0-9_-]{8,40}$/.test(r)) hits.push(nm+"->"+r);
}
console.log("n-oracle rawN:",O.rawN," capN:",O.capN);
console.log("HITS:", JSON.stringify(hits.slice(0,40)));
