import { readFileSync } from "node:fs";
const s=readFileSync("base.js","utf8");
// find all "signatureCipher" literal usages (not the t-dict)
let idx=0,n=0;
while((idx=s.indexOf("signatureCipher",idx+1))!==-1 && n<8){
  n++;
  // skip the t-dict occurrence
  const ctx=s.slice(idx-70,idx+70).replace(/\n/g," ");
  console.log("@"+idx+": ..."+ctx+"...");
}
