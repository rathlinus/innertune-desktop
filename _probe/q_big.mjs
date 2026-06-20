import { readFileSync } from "node:fs";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
const src = readFileSync("base.js","utf8");
const pr = JSON.parse(readFileSync("q_player.json","utf8"));
const f=pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
const sc=new URLSearchParams(f.signatureCipher);
const S=sc.get("s"), N=new URL(sc.get("url")).searchParams.get("n");
function makeStub(){ const f=function(){return stub;}; const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}}); return stub; }
const ctx={navigator:{userAgent:"x",platform:"Win32",languages:["de"]},location:{href:"https://music.youtube.com/",protocol:"https:",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(s)=>Buffer.from(s,"binary").toString("base64"),atob:(s)=>Buffer.from(s,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{ vm.runInContext(src,ctx,{timeout:8000}); }catch(e){}
const yp=ctx._yt_player;
const a1=Object.keys(yp).filter(k=>typeof yp[k]==="function"&&yp[k].length===1);
const bySize=a1.map(k=>[k,yp[k].toString().length]).sort((a,b)=>b[1]-a[1]).slice(0,15);
for(const [k,sz] of bySize){
  let rs,rn,es,en;
  try{ rs=yp[k](S); }catch(e){ es=e.message; }
  try{ rn=yp[k](N); }catch(e){ en=e.message; }
  const show=(r,e)=>e?("THREW:"+e):(typeof r==="string"?`"${r.slice(0,46)}"(${r.length})`:typeof r);
  console.log(`${k} sz=${sz}\n   S-> ${show(rs,es)}\n   N-> ${show(rn,en)}`);
}
