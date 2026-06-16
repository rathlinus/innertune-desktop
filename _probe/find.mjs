import { readFileSync } from "node:fs";
const s = readFileSync(new URL("./base.js", import.meta.url), "utf8");

// All split("") sites with generous context
console.log("===== split(\"\") sites =====");
let re = /.{40}\.split\(""\).{20}/g, m;
let i = 0;
while ((m = re.exec(s)) && i < 25) { console.log(i++, m[0]); }

// Find the n-transform call site: ytdl/yt-dlp look for `get("n"` then a fn call
console.log("\n===== n call-sites =====");
re = /[a-zA-Z0-9_$]{1,4}=([a-zA-Z0-9_$]{1,4})(?:\[(\d+)\])?\(([a-zA-Z0-9_$]{1,4})\)[;,].{0,40}/g;
// too broad; instead search around "n"
for (const mm of s.matchAll(/.{30}\bget\("n"\).{30}/g)) console.log("n:", mm[0]);
for (const mm of s.matchAll(/.{20}="nn"\[.{30}/g)) console.log("nn:", mm[0]);
for (const mm of s.matchAll(/.{30}String\.fromCharCode\(110\).{40}/g)) console.log("fcc110:", mm[0]);

// decipher apply site
console.log("\n===== sig apply sites =====");
for (const mm of s.matchAll(/.{0,50}decodeURIComponent\([a-zA-Z0-9_$.]{1,8}\).{0,30}/g)) {
  if (/=[a-zA-Z0-9_$]{1,4}\(decodeURIComponent/.test(mm[0])) console.log("sig?:", mm[0]);
}
