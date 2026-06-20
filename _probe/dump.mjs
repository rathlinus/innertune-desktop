import { readFileSync } from "node:fs";
const src = readFileSync("base.js","utf8");
function block(from){ const st=src.indexOf("{",from); let d=0; for(let i=st;i<src.length;i++){const c=src[i]; if(c==="{")d++; else if(c==="}"){d--; if(!d)return src.slice(st,i+1);}} }
// sig candidate: function that splits on a global and joins, referencing helper obj
const sigM = src.match(/([a-zA-Z0-9_$]{1,4})=function\((\w)\)\{\2=\2\.split\(([a-zA-Z0-9_$]+)\)/);
console.log("=== SIG fn name:", sigM?.[1], "splitvar:", sigM?.[3]);
if(sigM){ const body = sigM[1]+"=function("+sigM[2]+")"+block(sigM.index); console.log(body.slice(0,400)); 
  // helper object referenced inside: OBJ.method(a,b)
  const helper = body.match(/;([a-zA-Z0-9_$]+)\.[a-zA-Z0-9_$]+\(/)?.[1];
  console.log("=== helper obj:", helper);
}
// find global split var definition
