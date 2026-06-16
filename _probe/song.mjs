import { readFileSync } from "node:fs";
const load = (n) => JSON.parse(readFileSync(new URL(`./${n}.json`, import.meta.url), "utf8").replace(/^﻿/, ""));

// Deep-find the first renderer of a given key anywhere in the tree.
function find(o, key) {
  if (o == null || typeof o !== "object") return null;
  if (key in o) return o[key];
  for (const k of Object.keys(o)) {
    const r = find(o[k], key);
    if (r) return r;
  }
  return null;
}

const search = load("search");
const mrli = find(search, "musicResponsiveListItemRenderer");
console.log("=== musicResponsiveListItemRenderer (song row) ===");
console.log(JSON.stringify(mrli, null, 1).slice(0, 2600));

console.log("\n=== home musicTwoRowItemRenderer (card) ===");
const card = find(load("home"), "musicTwoRowItemRenderer");
console.log(JSON.stringify(card, null, 1).slice(0, 1800));
