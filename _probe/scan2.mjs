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
function bodyOf(name) {
  const m = s.match(new RegExp(name + "=function\\([a-zA-Z0-9_$]{0,3}\\)\\{"));
  if (!m) return "NOT FOUND";
  return block(s, m.index + m[0].length - 1);
}
for (const n of process.argv.slice(2)) {
  const b = bodyOf(n);
  console.log(`===== ${n} (${b.length}) =====`);
  console.log(b.slice(0, 900));
  console.log();
}
