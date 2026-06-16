// RE harness: drive the real youtubei/v1 API with the captured session, capture
// responses, and report renderer-type histograms so we can write parsers against
// what we actually see (not guesses). Saves each response to <tag>.json.
//
// Usage: node re.mjs            (runs the whole capture sequence)
//        node re.mjs <tag> dump <RendererName>   (dump first node of a saved file)
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const s = JSON.parse(readFileSync(new URL("../frontend/data/session.json", import.meta.url), "utf8").replace(/^﻿/, ""));
const O = "https://music.youtube.com";
function auth() {
  const sid = s.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/)[1];
  const ts = Math.floor(Date.now() / 1000);
  return `SAPISIDHASH ${ts}_${createHash("sha1").update(`${ts} ${sid} ${O}`).digest("hex")}`;
}
const client = { ...(s.context?.client ?? {}), clientName: "WEB_REMIX", clientVersion: s.clientVersion, hl: "de", gl: "DE", visitorData: s.visitor_data };
async function call(endpoint, body) {
  const r = await fetch(`${O}/youtubei/v1/${endpoint}?prettyPrint=false&key=${s.apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Cookie: s.cookie, Authorization: auth(),
      Origin: O, "X-Origin": O, Referer: `${O}/`, "X-Goog-AuthUser": "0",
      "X-Goog-Visitor-Id": s.visitor_data, "X-Youtube-Client-Name": "67",
      "X-Youtube-Client-Version": s.clientVersion,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({ context: { ...s.context, client }, ...body }),
  });
  if (!r.ok) throw new Error(`${endpoint} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// histogram of every "...Renderer" key
function hist(o, out = {}) {
  if (o == null || typeof o !== "object") return out;
  if (Array.isArray(o)) { for (const e of o) hist(e, out); return out; }
  for (const k of Object.keys(o)) { if (/Renderer$/.test(k)) out[k] = (out[k] || 0) + 1; hist(o[k], out); }
  return out;
}
function findOne(o, key) {
  if (o == null || typeof o !== "object") return null;
  if (key in o) return o[key];
  for (const k of Object.keys(o)) { const r = findOne(o[k], key); if (r) return r; }
  return null;
}
function report(tag, o) {
  writeFileSync(new URL(`./${tag}.json`, import.meta.url), JSON.stringify(o));
  const h = hist(o);
  const top = Object.entries(h).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join("  ");
  console.log(`\n===== ${tag} =====`);
  console.log(top || "(no renderers)");
}

// dump mode
if (process.argv[2] && process.argv[3] === "dump") {
  const o = JSON.parse(readFileSync(new URL(`./${process.argv[2]}.json`, import.meta.url), "utf8").replace(/^﻿/, ""));
  const node = findOne(o, process.argv[4]);
  console.log(JSON.stringify(node, null, 1).slice(0, Number(process.argv[5] || 3500)));
  process.exit(0);
}

// ---- capture sequence ----
// 1. an unfiltered search to harvest real artist/album/playlist ids to drill into
const sr = await call("search", { query: "daft punk" });
report("re_search_all", sr);
function firstNav(o, pageType) {
  for (const ep of (function walk(x, acc = []) { if (x && typeof x === "object") { if (x.browseEndpointContextMusicConfig?.pageType === pageType && findOne(x, "browseId")) acc.push(x); for (const k of Object.keys(x)) walk(x[k], acc); } return acc; })(o)) {
    const b = findOne(o, "browseEndpoint"); // fallback
    void b;
  }
  // simpler: find a browseEndpoint whose config pageType matches
  const eps = [];
  (function walk(x) { if (x && typeof x === "object") { if (x.browseId && x.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === pageType) eps.push(x.browseId); for (const k of Object.keys(x)) walk(x[k]); } })(o);
  return eps[0] || null;
}
const artistId = firstNav(sr, "MUSIC_PAGE_TYPE_ARTIST");
const albumId = firstNav(sr, "MUSIC_PAGE_TYPE_ALBUM");
console.log(`\nharvested: artistId=${artistId} albumId=${albumId}`);

// 2. search suggestions
try { report("re_suggest", await call("music/get_search_suggestions", { input: "daf" })); } catch (e) { console.log("suggest ERR", String(e)); }

// 3. search filters (probe each chip's params)
const FILTERS = {
  videos: "EgWKAQIQAWoKEAkQChAFEAMQBA==",
  albums: "EgWKAQIYAWoKEAkQChAFEAMQBA==",
  artists: "EgWKAQIgAWoKEAkQChAFEAMQBA==",
  playlists: "EgWKAQIoAWoKEAkQChAFEAMQBA==",
};
for (const [k, params] of Object.entries(FILTERS)) {
  try { report(`re_search_${k}`, await call("search", { query: "daft punk", params })); } catch (e) { console.log(`search ${k} ERR`, String(e)); }
}

// 4. artist page
if (artistId) { try { report("re_artist", await call("browse", { browseId: artistId })); } catch (e) { console.log("artist ERR", String(e)); } }

// 5. album
if (albumId) { try { report("re_album", await call("browse", { browseId: albumId })); } catch (e) { console.log("album ERR", String(e)); } }

// 6. up-next / queue (+related lives in this response's tabs)
try { report("re_next", await call("next", { videoId: "dQw4w9WgXcQ" })); } catch (e) { console.log("next ERR", String(e)); }

// 7. library variants + history
for (const [tag, browseId] of [
  ["re_lib_songs", "FEmusic_liked_videos"],
  ["re_lib_albums", "FEmusic_liked_albums"],
  ["re_lib_artists", "FEmusic_library_corpus_track_artists"],
  ["re_history", "FEmusic_history"],
]) {
  try { report(tag, await call("browse", { browseId })); } catch (e) { console.log(`${tag} ERR`, String(e)); }
}
console.log("\n[done]");
