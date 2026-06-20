import { readFileSync } from "node:fs";
const s=readFileSync("base.js","utf8");
const a=s.indexOf('t="url;U;toString;');
let i=a+2; // at opening quote
const start=i+1; let p=start;
for(;p<s.length;p++){ if(s[p]==="\\"){p++;continue;} if(s[p]==='"')break; }
const raw=s.slice(start,p);
const arr=raw.split(";");
console.log("t.length",arr.length);
for(const w of ["n","sig","sp","get","set","split","join","reverse","splice","forEach","slice","push","unshift","indexOf","length","call"])
  console.log(w.padEnd(10),arr.indexOf(w));
