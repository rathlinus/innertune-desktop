import { readFileSync } from "node:fs";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
let src=readFileSync("base.js","utf8");
const O=JSON.parse(readFileSync("oracle.json","utf8"));
function matchBrace(s,open){let d=0;for(let i=open;i<s.length;i++){const c=s[i];if(c==="{")d++;else if(c==="}"){d--;if(!d)return i+1;}}return -1;}
{ const a=src.indexOf("var T6={SR:function"); const ob=src.indexOf("{",a); const end=matchBrace(src,ob);
  src=src.slice(0,end)+";globalThis.__T6=T6;"+src.slice(end); }
{ const a=src.indexOf('t="url;U;toString;'); src=src.slice(0,a+2)+"globalThis.__t="+src.slice(a+2); }
function makeStub(){const f=function(){return stub;};const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}});return stub;}
const ctx={navigator:{userAgent:"Mozilla/5.0 Chrome/149",platform:"Win32",languages:["de"],language:"de"},location:{href:"https://music.youtube.com/",protocol:"https:",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(s)=>Buffer.from(s,"binary").toString("base64"),atob:(s)=>Buffer.from(s,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{vm.runInContext(src,ctx,{timeout:8000});}catch(e){console.log("run threw:",e.message);}
const t=ctx.__t, T6=ctx.__T6;
console.log("exposed: t=",Array.isArray(t)?("array["+t.length+"]"):typeof t," T6=",typeof T6, T6&&Object.keys(T6));
if(!t||!T6){process.exit(1);}
const splitIdx=t.indexOf("split");
console.log("split@",splitIdx,"join@",t.indexOf("join"),"empty@",t.indexOf(""),"reverse@",t.indexOf("reverse"),"splice@",t.indexOf("splice"));
const Y=splitIdx^7169;
console.log("Y=",Y,"=> t[Y^7169]=",JSON.stringify(t[Y^7169]),"t[Y^7189]=",JSON.stringify(t[Y^7189]),"t[Y^7190]=",JSON.stringify(t[Y^7190]));
console.log("method1 t[Y^7225]=",JSON.stringify(t[Y^7225]),"method2 t[Y^7200]=",JSON.stringify(t[Y^7200]));
console.log("consts: Y^7177=",Y^7177,"Y^7230=",Y^7230);
function descr(z){const Q=z.split("");T6[t[Y^7225]](Q,Y^7177);T6[t[Y^7225]](Q,1);T6[t[Y^7200]](Q,Y^7230);return Q.join("");}
try{const out=descr(O.rawS);console.log("\nrecipe:",out,"\noracle:",O.sig,"\nMATCH:",out===O.sig);}catch(e){console.log("descr threw",e.message);}
