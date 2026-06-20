import { readFileSync } from "node:fs";
const s = readFileSync(process.argv[2], "utf8");
const i = s.indexOf("lM=function(");
const body = s.slice(i, i + 700);
console.log("=== lM head (700) ===");
console.log(body);
