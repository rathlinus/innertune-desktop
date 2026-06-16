// Smoke-test every new /api endpoint through the running dev server.
const B = "http://127.0.0.1:5173/api";
const get = async (p) => {
  const r = await fetch(B + p);
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
};
function summ(label, { status, j }) {
  let s = `[${status}] ${label}: `;
  if (j.suggestions) s += `${j.suggestions.length} suggestions → ${j.suggestions.slice(0, 4).join(", ")}`;
  else if (j.results) s += `${j.results.length} results` + (j.results[0] ? ` → ${j.results[0].kind || ""} ${JSON.stringify(j.results[0].title || j.results[0].name)}` : "");
  else if (j.sections) s += `${j.sections.length} sections → ${j.sections.map((x) => `${x.title}(${x.tracks.length})`).join(", ")}`;
  else if (j.name !== undefined) s += `artist "${j.name}" subs=${j.subscribers} songs=${j.songs.length} shelves=${j.shelves.length} → ${j.shelves.map((x) => x.title).slice(0, 6).join(" | ")}`;
  else if (j.tracks && j.relatedBrowseId !== undefined) s += `queue ${j.tracks.length} tracks, related=${j.relatedBrowseId?.slice(0, 12)} lyrics=${j.lyricsBrowseId?.slice(0, 12)} → ${JSON.stringify(j.tracks[0]?.title)}`;
  else if (j.title !== undefined) s += `album "${j.title}" by ${j.artist} (${j.subtitle}) ${j.tracks.length} tracks → ${JSON.stringify(j.tracks[0]?.title)}`;
  else if (j.tracks) s += `${j.tracks.length} tracks + ${j.shelves?.length} shelves`;
  else s += JSON.stringify(j).slice(0, 120);
  console.log(s);
}

summ("suggest", await get("/suggest?q=daf"));
summ("search albums", await get("/search?q=" + encodeURIComponent("daft punk") + "&filter=albums"));
summ("search artists", await get("/search?q=" + encodeURIComponent("daft punk") + "&filter=artists"));
summ("search playlists", await get("/search?q=" + encodeURIComponent("daft punk") + "&filter=playlists"));
summ("artist", await get("/artist/UCRr1xG_2WIDs18a6cIiCxeA"));
summ("album", await get("/album/MPREb_ePmUY37w4pZ"));
const nx = await get("/next/dQw4w9WgXcQ");
summ("next", nx);
if (nx.j.relatedBrowseId) summ("related", await get("/related/" + nx.j.relatedBrowseId));
summ("library songs", await get("/library/songs"));
summ("library artists", await get("/library/artists"));
summ("library albums", await get("/library/albums"));
summ("history", await get("/history"));
