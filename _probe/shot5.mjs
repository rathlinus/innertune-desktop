// Play radio, advance a few tracks, open the queue, and confirm the playing row
// is scrolled to the top (earlier tracks remain above, scrolled out of view).
import { writeFileSync } from "node:fs";
const ver = await (await fetch("http://127.0.0.1:9222/json/version")).json();
const sock = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (sock.onopen = r));
let id = 0; const pending = new Map();
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((res) => { const mid = ++id; pending.set(mid, res); sock.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { result: { targetId } } = await send("Target.createTarget", { url: "http://127.0.0.1:5173/" });
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
const evalJs = (expression) => send("Runtime.evaluate", { expression, returnByValue: true }, sessionId).then((r) => r.result?.result?.value);
await sleep(4000);

await evalJs(`document.querySelector('.shelf-track .card')?.click()`); // start radio
await sleep(4000);
for (let i = 0; i < 5; i++) { // advance the queue a few tracks
  await evalJs(`[...document.querySelectorAll('.player-left .ctrl')].find(b=>b.title==='Weiter')?.click()`);
  await sleep(700);
}
await evalJs(`document.querySelector('.player-track')?.click()`); // open fullscreen
await sleep(1600);
// measure: distance from the playing row's top to the queue container's top (≈0 means at top)
const diag = await evalJs(`(()=>{const c=document.querySelector('.fsp-queue');const a=document.querySelector('.fsp-q-item.playing');const panel=document.querySelector('.fsp-panel');return JSON.stringify({queue:c?{scrollTop:Math.round(c.scrollTop),scrollH:c.scrollHeight,clientH:c.clientHeight}:null, panel:panel?{scrollTop:Math.round(panel.scrollTop),scrollH:panel.scrollHeight,clientH:panel.clientHeight}:null, offset:(c&&a)?Math.round(a.getBoundingClientRect().top-c.getBoundingClientRect().top):'no'});})()`);
console.log("diag:", diag);
const a = await send("Page.captureScreenshot", { format: "png" }, sessionId);
writeFileSync(new URL("./app_queue_scroll.png", import.meta.url), Buffer.from(a.result.data, "base64"));
console.log("saved app_queue_scroll.png");
await send("Target.closeTarget", { targetId });
sock.close();
