import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync("base.js","utf8");

// Permissive stub: any property access returns a callable/indexable stub.
function makeStub(name){
  const f = function(){ return stub; };
  const stub = new Proxy(f, {
    get(_,p){ if(p==="length")return 0; if(p===Symbol.toPrimitive)return ()=>""; if(p==="toString")return ()=>""; return stub; },
    set(){ return true; },
    apply(){ return stub; },
    construct(){ return stub; },
    has(){ return true; },
  });
  return stub;
}
const navigator = { userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36", appVersion:"5.0", platform:"Win32", language:"de", languages:["de"], product:"Gecko", vendor:"Google Inc.", cookieEnabled:true };
const ctx = {
  navigator,
  location:{ href:"https://music.youtube.com/", protocol:"https:", host:"music.youtube.com", hostname:"music.youtube.com", origin:"https://music.youtube.com", search:"", hash:"", pathname:"/" },
  document: makeStub("document"),
  XMLHttpRequest: function(){ return makeStub("xhr"); },
  setTimeout:()=>0, clearTimeout:()=>{}, setInterval:()=>0, clearInterval:()=>{},
  console, Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
  TextEncoder, TextDecoder, URL, URLSearchParams, Array, Object, String, Number, Boolean, RegExp, Error, Symbol, Map, Set, WeakMap, WeakSet, Promise, Function, Reflect, Proxy, Uint8Array, Uint32Array, Int32Array, ArrayBuffer, DataView, Float64Array, btoa:(s)=>Buffer.from(s,"binary").toString("base64"), atob:(s)=>Buffer.from(s,"base64").toString("binary"),
  performance:{ now:()=>Date.now() },
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.top = ctx;
vm.createContext(ctx);
try {
  vm.runInContext(src, ctx, { timeout: 8000 });
  console.log("RAN OK");
} catch(e){ console.log("THREW:", e.message); }
const yp = ctx._yt_player || {};
const keys = Object.keys(yp);
console.log("_yt_player keys:", keys.length);
const fns = keys.filter(k=>typeof yp[k]==="function");
console.log("function keys:", fns.length);
console.log("arity1 fns:", fns.filter(k=>yp[k].length===1).length, fns.filter(k=>yp[k].length===1).slice(0,40).join(","));
