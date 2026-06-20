import { readFileSync } from "node:fs";
const s = readFileSync(process.argv[2], "utf8");
// n-challenge driver: a function whose body contains a big array literal AND a
// self-reference `<w>[<expr>]=<w>`. Find such self-references and their fn.
const selfRef = [...s.matchAll(/([A-Za-z0-9$_]+)\[[A-Za-z0-9$_^ ]+\]=\1;/g)];
console.log("array self-ref sites:", selfRef.length);
for (const m of selfRef.slice(0, 6)) {
  const idx = m.index;
  // enclosing function name
  const pre = s.slice(Math.max(0, idx - 6000), idx);
  const fn = [...pre.matchAll(/([A-Za-z0-9$_]+)=function\(/g)].pop();
  // is there a big array decl `var <w>=[` shortly before with many commas?
  const near = s.slice(Math.max(0, idx - 1500), idx);
  const arr = near.lastIndexOf("=[");
  const commas = arr >= 0 ? (near.slice(arr).match(/,/g) || []).length : 0;
  console.log(`  self-ref ${m[0].slice(0,20)} | enclosingFn=${fn && fn[1]} | arrayCommasBefore=${commas}`);
}
