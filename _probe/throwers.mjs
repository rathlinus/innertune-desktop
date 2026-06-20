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
const a1=Object.keys(yp).filter(k=>typeof yp[k]==="function"&&yp[k].length===1);
const errs={};
for(const k of a1){
  try{ yp[k](S); }catch(e){ const m=e.message.slice(0,50); (errs[m]=errs[m]||[]).push(k); }
}
const sorted=Object.entries(errs).sort((a,b)=>b[1].length-a[1].length);
for(const [m,ks] of sorted) console.log(ks.length, "|", m, "|", ks.slice(0,8).join(","));
