import { writeFileSync } from "node:fs";
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const url="https://www.youtube.com/s/player/ac678d18/player_ias.vflset/en_US/base.js";
const js=await (await fetch(url,{headers:{"User-Agent":UA}})).text();
writeFileSync("base_ias.js", js);
console.log("ias bytes:", js.length);
