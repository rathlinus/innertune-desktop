import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync(process.env.YTM_DATA + "/session.json","utf8"));
const WEB_UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const seen = new Map();
for (let i=0;i<8;i++){
  const html = await (await fetch("https://music.youtube.com/",{headers:{Cookie:s.cookie,"X-Goog-Visitor-Id":s.visitor_data,"Accept-Language":"en","User-Agent":WEB_UA}})).text();
  const jsUrl = html.match(/"jsUrl":"([^"]+)"/)?.[1];
  const id = jsUrl?.match(/\/player\/([^/]+)\//)?.[1];
  if (!id) { console.log(i,"NO jsUrl, html len", html.length); continue; }
  if (seen.has(id)) { seen.set(id, seen.get(id)+1); continue; }
  const js = await (await fetch("https://music.youtube.com"+jsUrl,{headers:{"User-Agent":WEB_UA}})).text();
  seen.set(id,1);
  console.log(id, "len", js.length, "alr-fingerprint:", /"alr"\s*,\s*"yes"/.test(js), "sts:", js.match(/signatureTimestamp:(\d+)/)?.[1]);
}
console.log([...seen.entries()]);
