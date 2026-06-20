import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
const VID=process.argv[2]||"LcSZ-2-fwT0";
const sess=JSON.parse(readFileSync("../frontend/data/session.json","utf8").replace(/^﻿/,""));
const O="https://music.youtube.com";
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
function sapis(){const sid=sess.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/)[1];const ts=Math.floor(Date.now()/1000);return `SAPISIDHASH ${ts}_${createHash("sha1").update(`${ts} ${sid} ${O}`).digest("hex")}`;}
const cl={...(sess.context?.client??{}),clientName:"WEB_REMIX",clientVersion:sess.clientVersion,hl:"de",gl:"DE",visitorData:sess.visitor_data};
const pr=await (await fetch(`${O}/youtubei/v1/player?prettyPrint=false&key=${sess.apiKey}`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:sess.cookie,Authorization:sapis(),Origin:O,"X-Origin":O,Referer:O+"/","X-Goog-AuthUser":"0","X-Goog-Visitor-Id":sess.visitor_data,"X-Youtube-Client-Name":"67","X-Youtube-Client-Version":sess.clientVersion,"User-Agent":UA},body:JSON.stringify({context:{client:cl},videoId:VID,playbackContext:{contentPlaybackContext:{html5Preference:"HTML5_PREF_WANTS",signatureTimestamp:20620}},contentCheckOk:true,racyCheckOk:true})})).json();
console.log("playability:",pr.playabilityStatus?.status);
const vd=pr.videoDetails||{};
console.log("title:",vd.title,"| artist:",vd.author,"| dur:",vd.lengthSeconds,"s");
const f=pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
if(!f){console.log("itag 141 not available. audio itags:",pr.streamingData.adaptiveFormats.filter(x=>String(x.mimeType).includes("audio")).map(x=>x.itag+"@"+x.bitrate));process.exit(1);}
const sc=new URLSearchParams(f.signatureCipher); const s=sc.get("s"),sp=sc.get("sp")||"sig",baseUrl=sc.get("url");
const nOrig=new URL(baseUrl).searchParams.get("n");

let src=readFileSync("base.js","utf8");
function mb(s,o){let d=0;for(let i=o;i<s.length;i++){const c=s[i];if(c==="{")d++;else if(c==="}"){d--;if(!d)return i+1;}}return -1;}
{const a=src.indexOf("var T6={SR:function");const ob=src.indexOf("{",a);const end=mb(src,ob);src=src.slice(0,end)+";globalThis.__ev=function(_n){try{return eval(_n)}catch(e){return ''+e}};"+src.slice(end);}
function makeStub(){const f=function(){return stub;};const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}});return stub;}
const ctx={navigator:{userAgent:UA,platform:"Win32",languages:["de"],language:"de"},location:{href:O+"/",protocol:"https:",hostname:"music.youtube.com",origin:O,search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(x)=>Buffer.from(x,"binary").toString("base64"),atob:(x)=>Buffer.from(x,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{vm.runInContext(src,ctx,{timeout:8000});}catch(e){console.log("run threw",e.message);}
const ev=ctx.__ev;
const sig=ev(`ty(41,7221,EC(40,4766,${JSON.stringify(s)}))`);
const nNew=ev(`EC(19,7741,${JSON.stringify(nOrig)})`);
console.log("native sig len:",sig?.length,"| n:",nOrig,"->",nNew);
const u=new URL(baseUrl); u.searchParams.set(sp,sig); u.searchParams.set("n",nNew);
const clen=Number(u.searchParams.get("clen")), dur=Number(u.searchParams.get("dur"));
u.searchParams.set("range","0-"+(clen-1));
console.log("downloading",clen,"bytes (",Math.round(clen*8/dur/1000),"kbps )...");
const t0=Date.now();
const r=await fetch(u,{headers:{"User-Agent":UA}});
const buf=Buffer.from(await r.arrayBuffer());
const safe=(vd.title||VID).replace(/[\/:*?"<>|]/g,"_").slice(0,80);
const out=`${safe} [${VID}] 141.m4a`;
writeFileSync(out,buf);
console.log("HTTP",r.status,"| wrote",buf.length,"of",clen,"bytes | complete:",buf.length===clen,"| in",Date.now()-t0,"ms");
console.log("file:",out,"| hdr:",buf.slice(0,12).toString("hex"));
