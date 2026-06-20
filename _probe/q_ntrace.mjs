import { readFileSync } from "node:fs";
import vm from "node:vm";
process.on("unhandledRejection",()=>{});
let src=readFileSync("base.js","utf8");
function mb(s,o){let d=0;for(let i=o;i<s.length;i++){const c=s[i];if(c==="{")d++;else if(c==="}"){d--;if(!d)return i+1;}}return -1;}
{const a=src.indexOf("var T6={SR:function");const ob=src.indexOf("{",a);const end=mb(src,ob);src=src.slice(0,end)+";globalThis.__ev=function(_n){try{return eval(_n)}catch(e){return ''+e}};"+src.slice(end);}
function makeStub(){const f=function(){return stub;};const stub=new Proxy(f,{get(_,p){if(p==="length")return 0;if(p==="toString"||p===Symbol.toPrimitive)return()=>"";return stub;},set(){return true;},apply(){return stub;},construct(){return stub;},has(){return true;}});return stub;}
const ctx={navigator:{userAgent:"Mozilla/5.0 Chrome/149",platform:"Win32",languages:["de"],language:"de"},location:{href:"https://music.youtube.com/",protocol:"https:",hostname:"music.youtube.com",origin:"https://music.youtube.com",search:"",hash:"",pathname:"/"},document:makeStub(),XMLHttpRequest:function(){return makeStub();},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},console:{log(){},warn(){},error(){},info(){},debug(){}},Math,Date,JSON,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,TextEncoder,TextDecoder,URL,URLSearchParams,Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set,WeakMap,WeakSet,Promise,Function,Reflect,Proxy,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,DataView,Float64Array,btoa:(x)=>Buffer.from(x,"binary").toString("base64"),atob:(x)=>Buffer.from(x,"base64").toString("binary"),performance:{now:()=>Date.now()}};
ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;ctx.top=ctx;
vm.createContext(ctx);
try{vm.runInContext(src,ctx,{timeout:8000});}catch(e){}
const ev=ctx.__ev;
const N=(s)=>ev(`EC(19,7741,${JSON.stringify(s)})`);
// 1) does output length == input length? is it a permutation? value-dependent?
const A="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd"; // 40 distinct
const B="0000000000000000000000000000000000000000"; // 40 same
const C="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abce"; // last char differs from A
console.log("len in=40");
console.log("N(A)=",N(A));
console.log("N(B)=",N(B));
console.log("N(C)=",N(C));
console.log("A vs C differ only at idx39; outputs differ at indices:");
const oa=N(A),oc=N(C);
let diff=[]; for(let i=0;i<Math.max(oa.length,oc.length);i++) if(oa[i]!==oc[i]) diff.push(i);
console.log(" lenA",oa.length,"lenC",oc.length,"diffIdx",JSON.stringify(diff));
// 2) determinism
console.log("deterministic:", N(A)===N(A));
