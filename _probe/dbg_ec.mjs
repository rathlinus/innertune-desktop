import { readFileSync } from "node:fs";
const s = readFileSync(process.argv[2], "utf8");
const ECFN = "KS", ARR = "x";
const i = s.indexOf(ECFN + "=function(");
const body = s.slice(i, i + 1600);
console.log("=== KS body (1600) ===");
console.log(body);
