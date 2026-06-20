import { readFileSync } from "node:fs";

const pr = JSON.parse(readFileSync("q_player.json","utf8"));
const SRC = readFileSync("base.js","utf8");
const f = pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
const sc = new URLSearchParams(f.signatureCipher);
const S = sc.get("s"), SP = sc.get("sp")||"sig", baseUrl = sc.get("url");
const N0 = new URL(baseUrl).searchParams.get("n");

// browser-level WS to create a throwaway tab
const ver = await (await fetch("http://127.0.0.1:9222/json/version")).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
let id=0; const pend=new Map();
const send=(ws,method,params)=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
const onmsg=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
bws.addEventListener("message",onmsg);
await new Promise(r=>bws.addEventListener("open",r));
const created = await send(bws,"Target.createTarget",{url:"about:blank"});
const targetId = created.result.targetId;

const pws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${targetId}`);
pws.addEventListener("message",onmsg);
await new Promise(r=>pws.addEventListener("open",r));
await send(pws,"Runtime.enable",{});

const tail = `
var yp=out;
if(!yp) return JSON.stringify({err:"no _yt_player captured"});
var S=${JSON.stringify(S)}, N=${JSON.stringify(N0)};
var a1=Object.keys(yp).filter(function(k){return typeof yp[k]==="function" && yp[k].length===1;});
var sig=[], n=[];
for(var i=0;i<a1.length;i++){var k=a1[i];try{var r=yp[k](S);if(typeof r==="string"&&r!==S&&r.length>=80&&r.length<=120)sig.push([k,r]);}catch(e){}}
for(var i=0;i<a1.length;i++){var k=a1[i];try{var r=yp[k](N);if(typeof r==="string"&&r!==N&&r.length>=8&&r.length<=40)n.push([k,r]);}catch(e){}}
return JSON.stringify({count:a1.length, sig:sig, n:n});
`;
const expr = `(function(){var out;try{(function(){${SRC}
;try{out=_yt_player;}catch(e){}})();}catch(e){return JSON.stringify({err:"boot:"+String(e)});}${tail}})()`;

const r = await send(pws,"Runtime.evaluate",{ expression: expr, returnByValue:true, timeout:15000 });
await send(bws,"Target.closeTarget",{targetId});
bws.close(); pws.close();

const val = r.result?.result?.value;
if(!val){ console.log("no value:", JSON.stringify(r.result||r).slice(0,500)); process.exit(1); }
const out = JSON.parse(val);
console.log("arity-1 fns:", out.count, out.err||"");
console.log("SIG candidates:", JSON.stringify(out.sig));
console.log("N candidates:", JSON.stringify(out.n));

const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
async function test(label,url){ try{ const r=await fetch(url,{headers:{Range:"bytes=0-99","User-Agent":UA}}); console.log(label.padEnd(22), r.status, r.headers.get("content-type"), r.headers.get("content-length")); return r.status; }catch(e){ console.log(label,"ERR",e.message); return 0; } }
for(const [sk,sv] of (out.sig||[])){
  for(const [nk,nv] of ((out.n||[]).length?out.n:[["raw",N0]])){
    const u=new URL(baseUrl); u.searchParams.set(SP,sv); u.searchParams.set("n",nv);
    const st=await test(`sig=${sk} n=${nk}`, u.toString());
    if(st===200||st===206){ console.log("\n*** WORKING 256k URL ***\nsig fn:",sk," n fn:",nk,"\n"+u.toString()); }
  }
}
