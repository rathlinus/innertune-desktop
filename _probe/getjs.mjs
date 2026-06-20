import { readFileSync, writeFileSync } from "node:fs";
const s = JSON.parse(readFileSync("../frontend/data/session.json","utf8").replace(/^﻿/,""));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const html = await (await fetch("https://music.youtube.com/", {
  headers: { Cookie:s.cookie, "X-Goog-Visitor-Id":s.visitor_data, "Accept-Language":"de", "User-Agent":UA }
})).text();
const jsUrl = html.match(/"jsUrl":"([^"]+)"/)?.[1];
console.log("jsUrl:", jsUrl);
const full = jsUrl.startsWith("http") ? jsUrl : "https://music.youtube.com"+jsUrl;
const js = await (await fetch(full, { headers:{ "User-Agent":UA } })).text();
writeFileSync("base.js", js);
console.log("base.js bytes:", js.length);
// player id (sts)
console.log("STS:", js.match(/signatureTimestamp[:=](\d+)/)?.[1] || js.match(/sts[:=](\d+)/)?.[1]);
console.log("playerId:", full.match(/player\/([\w]+)\//)?.[1]);
