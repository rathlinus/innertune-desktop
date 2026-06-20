import { readFileSync } from "node:fs";

// --- pull our cipher params from the WEB_REMIX player response ---
const pr = JSON.parse(readFileSync("q_player.json","utf8"));
const f = pr.streamingData.adaptiveFormats.find(x=>x.itag===141);
const sc = new URLSearchParams(f.signatureCipher);
const S = sc.get("s"), SP = sc.get("sp")||"sig", baseUrl = sc.get("url");
const N0 = new URL(baseUrl).searchParams.get("n");

// --- find the music.youtube.com page target ---
const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = targets.find(t=>t.type==="page" && t.url.includes("music.youtube.com"));
if(!page) { console.log("no music page target"); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
function cmd(method, params){ return new Promise(res=>{ const i=++id; pending.set(i,res); ws.send(JSON.stringify({id:i,method,params})); }); }
ws.addEventListener("message", e=>{ const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise(r=>ws.addEventListener("open",r));

const expr = `(()=>{
  const yp = window._yt_player;
  if(!yp) return JSON.stringify({err:"no _yt_player on window"});
  const S=${JSON.stringify(S)}, N=${JSON.stringify(N0)};
  const a1 = Object.keys(yp).filter(k=>typeof yp[k]==="function" && yp[k].length===1);
  const sig=[], n=[];
  for(const k of a1){ try{ const r=yp[k](S); if(typeof r==="string"&&r!==S&&r.length>=80&&r.length<=120) sig.push([k,r]); }catch(e){} }
  for(const k of a1){ try{ const r=yp[k](N); if(typeof r==="string"&&r!==N&&r.length>=8&&r.length<=40) n.push([k,r]); }catch(e){} }
  return JSON.stringify({count:a1.length, sig, n});
})()`;

const r = await cmd("Runtime.evaluate", { expression: expr, returnByValue: true });
ws.close();
const out = JSON.parse(r.result?.result?.value ?? '{"err":"no value","raw":'+JSON.stringify(r)+'}');
console.log("arity-1 fns in page:", out.count, out.err||"");
console.log("SIG candidates:", JSON.stringify(out.sig));
console.log("N candidates:", JSON.stringify(out.n));

// --- verify each combo against googlevideo ---
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
async function test(label,url){ try{ const r=await fetch(url,{headers:{Range:"bytes=0-99","User-Agent":UA}}); console.log(label.padEnd(22), r.status, r.headers.get("content-type"), r.headers.get("content-length")); return r.status; }catch(e){ console.log(label,"ERR",e.message); return 0; } }
for(const [sk,sv] of (out.sig||[])){
  for(const [nk,nv] of (out.n||[]).length?out.n:[["raw",N0]]){
    const u=new URL(baseUrl); u.searchParams.set(SP,sv); u.searchParams.set("n",nv);
    const st=await test(`sig=${sk} n=${nk}`, u.toString());
    if(st===200||st===206){ console.log("\n*** WORKING 256k URL ***\nsig fn:",sk," n fn:",nk,"\n"+u.toString()); }
  }
}
