import { readFileSync } from "node:fs";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
const src = readFileSync("base.js","utf8");
const pr = JSON.parse(readFileSync("q_player.json","utf8"));
function makeStub(){ const f=function(){return stub;}; const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}}); return stub; }
const ctx={navigator:{userAgent:"x",platform:"Win32",languages:["de"]},location:{href:"https://music.youtube.com/",protocol:"https:",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(s)=>Buffer.from(s,"binary").toString("base64"),atob:(s)=>Buffer.from(s,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{ vm.runInContext(src,ctx,{timeout:8000}); }catch(e){}
const yp=ctx._yt_player;
const f=pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
const sc=new URLSearchParams(f.signatureCipher);
const S=sc.get("s"), SP=sc.get("sp")||"sig", baseUrl=sc.get("url");
const N0=new URL(baseUrl).searchParams.get("n");
const sigCands={ raw:S, h0:yp.h0?.(S), QB:yp.QB?.(S) };
const nCands={ raw:N0, mh:yp.mh?.(N0), ht:yp.ht?.(N0) };
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
async function test(label,url){ try{ const r=await fetch(url,{headers:{Range:"bytes=0-99","User-Agent":UA}}); console.log(label.padEnd(20),r.status,r.headers.get("content-type")); return r.status; }catch(e){ console.log(label,"ERR",e.message); return 0; } }
for(const [sn,sv] of Object.entries(sigCands)){ if(typeof sv!=="string") continue;
  for(const [nn,nv] of Object.entries(nCands)){ if(typeof nv!=="string") continue;
    const u=new URL(baseUrl); u.searchParams.set(SP,sv); u.searchParams.set("n",nv);
    const st=await test(`sig=${sn} n=${nn}`,u.toString());
    if(st===200||st===206) console.log("*** WORKS ***",u.toString());
  }
}
