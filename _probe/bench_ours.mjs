import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
const VID=process.argv[2]||"lYBUbBu4W08";
const sess=JSON.parse(readFileSync("../frontend/data/session.json","utf8").replace(/^﻿/,""));
const O="https://music.youtube.com";
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const sapis=()=>{const sid=sess.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/)[1];const ts=Math.floor(Date.now()/1000);return `SAPISIDHASH ${ts}_${createHash("sha1").update(`${ts} ${sid} ${O}`).digest("hex")}`;};
const now=()=>Number(process.hrtime.bigint()/1000000n);
const T0=now();

// base.js (could be cached across calls; here measured cold each run)
const tb0=now();
const home=await (await fetch(O+"/",{headers:{Cookie:sess.cookie,"X-Goog-Visitor-Id":sess.visitor_data,"User-Agent":UA}})).text();
const jsUrl=O+home.match(/"jsUrl":"([^"]+)"/)[1];
const baseJs=await (await fetch(jsUrl,{headers:{"User-Agent":UA}})).text();
const sts=Number(baseJs.match(/signatureTimestamp:(\d+)/)[1]);
const tBaseJs=now()-tb0;

// vm build
const tv0=now();
let src=baseJs;
{const a=src.indexOf("var T6={SR:function");let d=0,end=-1;const ob=src.indexOf("{",a);for(let i=ob;i<src.length;i++){const c=src[i];if(c==="{")d++;else if(c==="}"&&--d===0){end=i+1;break;}}src=src.slice(0,end)+";globalThis.__ev=function(_n){try{return eval(_n)}catch(e){return '__ERR__'+e}};"+src.slice(end);}
const stub=()=>px;const px=new Proxy(stub,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return px;},set:()=>true,apply:()=>px,construct:()=>px,has:()=>true});
const ctx={navigator:{userAgent:UA,platform:"Win32",languages:["de"]},location:{href:O+"/",protocol:"https:",hostname:"music.youtube.com",origin:O,search:"",hash:"",pathname:"/"},document:px,XMLHttpRequest:function(){return px;},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(x)=>Buffer.from(x,"binary").toString("base64"),atob:(x)=>Buffer.from(x,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{vm.runInContext(src,ctx,{timeout:10000});}catch{}
const ev=ctx.__ev;
const tVm=now()-tv0;

// player call
const tp0=now();
const cl={...(sess.context?.client??{}),clientName:"WEB_REMIX",clientVersion:sess.clientVersion,hl:"de",gl:"DE",visitorData:sess.visitor_data};
const pr=await (await fetch(`${O}/youtubei/v1/player?prettyPrint=false&key=${sess.apiKey}`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:sess.cookie,Authorization:sapis(),Origin:O,"X-Origin":O,Referer:O+"/","X-Goog-AuthUser":"0","X-Goog-Visitor-Id":sess.visitor_data,"X-Youtube-Client-Name":"67","X-Youtube-Client-Version":sess.clientVersion,"User-Agent":UA},body:JSON.stringify({context:{client:cl},videoId:VID,playbackContext:{contentPlaybackContext:{html5Preference:"HTML5_PREF_WANTS",signatureTimestamp:sts}},contentCheckOk:true,racyCheckOk:true})})).json();
const tPlayer=now()-tp0;
const f=pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
const sc=new URLSearchParams(f.signatureCipher);const s=sc.get("s"),sp=sc.get("sp")||"sig",baseUrl=sc.get("url");
const nOrig=new URL(baseUrl).searchParams.get("n");

// descramble
const td0=now();
const sig=ev(`ty(41,7221,EC(40,4766,${JSON.stringify(s)}))`);
const nNew=ev(`EC(19,7741,${JSON.stringify(nOrig)})`);
const tDesc=now()-td0;
const u=new URL(baseUrl);u.searchParams.set(sp,sig);u.searchParams.set("n",nNew);
const clen=Number(u.searchParams.get("clen")),dur=Number(u.searchParams.get("dur"));
u.searchParams.set("range","0-"+(clen-1));
const tResolve=now()-T0;

// download
const tdl0=now();
const r=await fetch(u,{headers:{"User-Agent":UA}});
const buf=Buffer.from(await r.arrayBuffer());
const tDownload=now()-tdl0;
const tTotal=now()-T0;

console.log(JSON.stringify({
  itag:141, status:r.status, bytes:buf.length, clen, complete:buf.length===clen, kbps:Math.round(clen*8/dur/1000),
  ms:{ baseJs:tBaseJs, vmBuild:tVm, playerCall:tPlayer, descramble:tDesc, resolveTotal:tResolve, download:tDownload, total:tTotal }
}));
