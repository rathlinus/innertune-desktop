import { readFileSync } from "node:fs";
const s = readFileSync(new URL("./base.js", import.meta.url), "utf8");

function block(src, openIdx) {
  let i = src.indexOf("{", openIdx), d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") d++;
    else if (src[j] === "}") { d--; if (!d) return src.slice(openIdx, j + 1); }
  }
  return "";
}

// Find `NAME=function(ARG){...}` definitions and report ones using split+join.
const re = /([a-zA-Z0-9_$]{1,5})=function\(([a-zA-Z0-9_$]{0,3})\)\{/g;
let m;
const hits = [];
while ((m = re.exec(s))) {
  const body = block(s, m.index + m[0].length - 1);
  if (body.includes(".split(") && body.includes(".join(") && body.length < 5000) {
    hits.push({ name: m[1], arg: m[2], len: body.length, body });
  }
}
hits.sort((a, b) => a.len - b.len);
console.log("candidates (split+join):", hits.map((h) => `${h.name}(${h.arg}) len=${h.len}`).join(", "));
console.log();
for (const h of hits.slice(0, 4)) {
  console.log(`===== ${h.name} (len ${h.len}) =====`);
  console.log(h.body.slice(0, 700));
  console.log();
}
