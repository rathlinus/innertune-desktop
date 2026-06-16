import { readFileSync } from "node:fs";
const load = (n) => JSON.parse(readFileSync(new URL(`./${n}.json`, import.meta.url), "utf8").replace(/^﻿/, ""));

// Collect all distinct "...Renderer" keys and their paths (first occurrence).
export function renderers(o, path = "", out = {}) {
  if (o == null || typeof o !== "object") return out;
  if (Array.isArray(o)) { if (o.length) renderers(o[0], path + "[0]", out); return out; }
  for (const k of Object.keys(o)) {
    if (/Renderer$/.test(k) && !(k in out)) out[k] = path + "." + k;
    renderers(o[k], path + "." + k, out);
  }
  return out;
}

// Print the renderer key tree, collapsing arrays, to learn structure.
function tree(o, depth = 0, maxDepth = 6) {
  if (depth > maxDepth || o == null) return;
  if (Array.isArray(o)) {
    if (o.length) tree(o[0], depth, maxDepth); // representative element
    return;
  }
  if (typeof o !== "object") return;
  for (const k of Object.keys(o)) {
    const v = o[k];
    const tag = Array.isArray(v) ? `[${v.length}]` : typeof v === "object" && v ? "{}" : JSON.stringify(v)?.slice(0, 40);
    console.log("  ".repeat(depth) + k + " " + tag);
    if (typeof v === "object") tree(v, depth + 1, maxDepth);
  }
}

const which = process.argv[2] || "search";
const path = process.argv[3];
let o = load(which);
if (path) for (const seg of path.split(".")) o = Array.isArray(o) ? o[Number(seg)] : o[seg];
tree(o, 0, Number(process.argv[4] || 5));
