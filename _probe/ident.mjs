import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync("base.js","utf8");
const pr = JSON.parse(readFileSync("q_player.json","utf8"));
const f = pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
const sc = new URLSearchParams(f.signatureCipher);
const S = sc.get("s");
const N = new URL(sc.get("url")).searchParams.get("n");

function makeStub(){ const f=function(){return stub;}; const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}}); return stub; }
const navigator={userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/149.0.0.0 Safari/537.36",platform:"Win32",language:"de",languages:["de"],product:"Gecko",vendor:"Google Inc.",cookieEnabled:true,appVersion:"5.0"};
const ctx={navigator,location:{href:"https://music.youtube.com/",protocol:"https:",host:"music.youtube.com",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console,Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(s)=>Buffer.from(s,"binary").toString("base64"),atob:(s)=>Buffer.from(s,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
vm.runInContext(src,ctx,{timeout:8000});
const yp=ctx._yt_player;
const fns=Object.keys(yp).filter(k=>typeof yp[k]==="function"&&yp[k].length===1);

const okChar=(x)=>/^[A-Za-z0-9_\-=.%]+$/.test(x);
const sigC=[], nC=[];
for(const k of fns){
  try{ const r=yp[k](S); if(typeof r==="string"&&r!==S&&r.length>=90&&r.length<=110&&okChar(r)) sigC.push([k,r.length]); }catch{}
}
for(const k of fns){
  try{ const r=yp[k](N); if(typeof r==="string"&&r!==N&&r.length>=14&&r.length<=24&&okChar(r)) nC.push([k,r,r.length]); }catch{}
}
console.log("SIG candidates:", JSON.stringify(sigC));
console.log("N candidates:", JSON.stringify(nC));
