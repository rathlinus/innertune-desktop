import { readFileSync } from "node:fs";
const src = readFileSync("base.js","utf8");
// The swap operation is the most unique: var c=a[0];a[0]=a[b%a.length];...
const swap = src.match(/.{20}var (\w)=(\w)\[0\];\2\[0\]=\2\[(\w)%\2\.length\];\2\[\3%\2\.length\]=\1.{20}/);
console.log("SWAP ctx:", swap?.[0] || "NOT FOUND");
// reverse + splice presence
console.log("reverse anchors:", (src.match(/\w+\.reverse\(\)/g)||[]).slice(0,3));
console.log("splice anchors:", (src.match(/\w+\.splice\(0,\w+\)/g)||[]).slice(0,3));
// find helper object: var OBJ={key:function(a,b){...},...}; locate by the swap snippet's position
if(swap){ 
  const idx = swap.index;
  // walk back to "var XX={"
  const pre = src.slice(Math.max(0,idx-3000), idx);
  const m = [...pre.matchAll(/(?:var |,)([a-zA-Z0-9_$]+)=\{/g)];
  console.log("nearest obj decls before swap:", m.slice(-3).map(x=>x[1]));
}
