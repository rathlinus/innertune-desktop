import { readFileSync } from "node:fs";
const s = readFileSync(new URL("./base.js", import.meta.url), "utf8");

function block(src, re) {
  const m = src.match(re);
  if (!m) return "NOT FOUND";
  let i = src.indexOf("{", m.index), d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") d++;
    else if (src[j] === "}") { d--; if (!d) return src.slice(m.index, j + 1); }
  }
  return "UNBALANCED";
}

for (const n of ["lU", "vu5", "nY"]) {
  const b = block(s, new RegExp(n + "=function\\("));
  console.log(`=== ${n} (${b.length} chars) ===`);
  console.log(b.slice(0, 300));
  console.log();
}
console.log("waM def:", (s.match(/(?:var |[,;])waM=[^,;]{0,25}/) || ["?"])[0]);
console.log("n-site:", (s.match(/.{0,40}\.get\("n"\)\)?&&.{0,90}/) || ["?"])[0]);
console.log("sig-apply:", (s.match(/.{0,60}\&\&\([a-zA-Z]\.set\([^)]{0,40}/) || ["?"])[0]);
