# Reverse-Engineering YouTube Music — Playbook & Prompt

> Feed this file to the agent when continuing work on **ytmusicnative**. It is
> both a prompt (role + rules) and a reference (how the API works, what we know).
> Goal: drive YouTube Music's **real `youtubei/v1` API** directly, reverse-
> engineered from a logged-in Chrome session — **no wrapper libraries**
> (`ytmusicapi`, `youtubei.js`, `yt-dlp`) for metadata.

---

## 0. Prompt — read this first

You are extending a reverse-engineered YouTube Music client. The metadata layer
already talks to the real InnerTube API directly. Your job is to add the
remaining features (artist pages, albums, related/up-next, search filters,
playlist editing, history, search suggestions, etc.) the same way.

**Hard rules**
1. **No metadata wrapper libraries.** Call `youtubei/v1` directly via
   `frontend/server/innertube.ts`. Parse raw renderer JSON via
   `frontend/server/parse.ts`.
2. **Probe before you parse.** Never guess a response shape. Capture the real
   response first (`_probe/` workflow below), inspect it, then write the parser
   against what you actually see.
3. **Parse by deep-find, not fixed paths.** Use `findOne`/`findAll` on renderer
   type names. YouTube reshuffles container paths constantly; renderer *names*
   are stable.
4. **Verify against the live API** after every change (`tsc -b` then hit the
   endpoint through the dev server).
5. Keep the captured session out of git (`frontend/data/` is local secrets).

**Workflow for any new feature**
1. Find the request the web app makes (endpoint + body) — see §3 + §6.
2. Probe it, save the JSON, list its renderer types (§4).
3. Write/extend a parser in `parse.ts` (§5).
4. Expose it in `ytm.ts` + a route in `api.ts` (§7).
5. Wire the frontend (`src/api.ts`, types, component).
6. `tsc -b` + curl the endpoint to verify.

---

## 1. Architecture (where things live)

The **live backend is a Vite middleware in `frontend/server/`** — NOT the legacy
Python `backend/` (dead). Everything runs on one dev server:

```
./start.ps1            # http://127.0.0.1:5173 , API under /api
```

| File | Role |
|---|---|
| `server/chrome.ts` | Launches controlled Chrome (CDP), captures the session |
| `server/innertube.ts` | Authenticated `youtubei/v1` transport (SAPISIDHASH) |
| `server/parse.ts` | Renderer-JSON parsers (deep-find helpers + shapes) |
| `server/ytm.ts` | Feature functions (search/home/playlist/library/lyrics) |
| `server/stream.ts` | Audio (see §8 — the hard part) |
| `server/api.ts` | Route table mapping `/api/*` → the above |

---

## 2. The session capture (how we authenticate)

`chrome.ts` launches the user's real Chrome with a dedicated profile and the
DevTools port open, waits for login, then reads what the web client uses:

```
chrome.exe --remote-debugging-port=9222 --user-data-dir=frontend/data/chrome-profile https://music.youtube.com/
```

Over CDP (Node 22's built-in `WebSocket`, no Playwright) we capture into
`frontend/data/session.json`:

- `cookie` — full jar (for the `Cookie` header)
- `visitor_data` — `ytcfg.get('VISITOR_DATA')` → `X-Goog-Visitor-Id`
- `apiKey` — `INNERTUBE_API_KEY` → `?key=`
- `clientVersion` — WEB_REMIX client version (e.g. `1.20260609.07.00`)
- `context` — full `INNERTUBE_CONTEXT` (locale, etc.)

Trigger: `POST /api/auth/login` (Chrome already open + logged in ⇒ recaptures
instantly). Status: `GET /api/auth/status`. CDP cookie read =
`Storage.getCookies`; page values = `Runtime.evaluate` on the
`music.youtube.com` target reading `ytcfg`.

---

## 3. The InnerTube request recipe (the core of the RE)

Every authenticated call is a POST to:

```
https://music.youtube.com/youtubei/v1/{endpoint}?prettyPrint=false&key={apiKey}
```

with a JSON body `{ context, ...params }` and these headers:

```
Content-Type: application/json
Cookie: <full jar>
Authorization: SAPISIDHASH <ts>_<sha1(`${ts} ${SAPISID} https://music.youtube.com`)>
Origin / X-Origin / Referer: https://music.youtube.com
X-Goog-AuthUser: 0
X-Goog-Visitor-Id: <visitor_data>
X-Youtube-Client-Name: 67          # 67 = WEB_REMIX
X-Youtube-Client-Version: <clientVersion>
User-Agent: <a real Chrome UA>
```

**SAPISIDHASH** is the whole auth trick (Google web clients use it):
`ts = unix_seconds`, `hash = SHA1("<ts> <SAPISID> <origin>")`, header value
`SAPISIDHASH <ts>_<hash>`. `SAPISID` comes from the cookie (fallbacks:
`__Secure-3PAPISID`, `__Secure-1PAPISID`). Implemented in `innertube.ts`
(`sapisidAuth`, `callMusic`). **This is verified working — reuse it, don't
reinvent.**

`context` = the captured `INNERTUBE_CONTEXT` with `client.clientName="WEB_REMIX"`,
`clientVersion`, `hl/gl` (de/DE), `visitorData`.

**Continuations** (lazy-loaded shelves/rows): the response carries a token at
`nextContinuationData.continuation` or
`continuationItemRenderer.continuationEndpoint.continuationCommand.token`. Re-POST
the same endpoint with body `{ continuation: token }` and merge results. See
`ytm.ts` `home()` for the pattern.

---

## 4. Probe workflow (`_probe/` — your microscope)

`_probe/` holds throwaway Node scripts (`.mjs`, run with `node x.mjs`). The
pattern that worked:

1. **Capture** a raw response — easiest is a temporary `/api/_raw?ep=...` route
   (we add/remove one) or a small fetch script using `data/session.json`.
   ⚠️ If saving via PowerShell `Out-File -Encoding utf8`, it adds a **BOM** —
   strip it before `JSON.parse`: `.replace(/^﻿/, "")`.
2. **List renderer types** present (so you know what to parse):
   ```js
   function findAll(o,key,out=[]){ if(o&&typeof o==="object"){ if(Array.isArray(o)){for(const e of o)findAll(e,key,out);} else for(const k of Object.keys(o)){ if(k===key)out.push(o[k]); else findAll(o[k],key,out); } } return out; }
   // collect every "...Renderer" key name to see the menu
   ```
3. **Dump one node** of the interesting renderer (`JSON.stringify(node,null,1).slice(0,2000)`)
   to learn its fields.
4. Write the parser, then delete the probe route/scripts.

Reusable probe helpers already written: `_probe/shape.mjs` (renderer tree),
`_probe/song.mjs` (dump a song row + card). Keep `_probe/` out of the shipped
build.

---

## 5. Renderer parsing reference

YouTube responses are nested "renderer" objects. Read only the fields you need,
via `parse.ts` helpers: `findOne`, `findAll`, `text`, `thumb`, `hiRes`,
`endpoint`.

| Renderer | What it is | Key fields |
|---|---|---|
| `musicResponsiveListItemRenderer` | a **song/row** | `flexColumns[].musicResponsiveListItemFlexColumnRenderer.text.runs`; videoId from the overlay `musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint`; `fixedColumns` may hold duration |
| `musicTwoRowItemRenderer` | a **card** (home/grid) | `title.runs`, `subtitle.runs`, `thumbnailRenderer`, `navigationEndpoint` (watch vs browse), `aspectRatio` (16_9 ⇒ video) |
| `musicCarouselShelfRenderer` | a **home shelf** | `header...title`, `contents[]` of cards |
| `musicShelfRenderer` | a **list shelf** (search/section) | `contents[]` of rows |
| `musicCardShelfRenderer` | search **top result** | thumbnail + title/subtitle runs |
| `musicDescriptionShelfRenderer` | **lyrics** body | `description.runs`, `footer` (source) |
| `musicResponsiveHeaderRenderer` / `musicDetailHeaderRenderer` | playlist/album **header** | `title`, subtitle, stats |
| `gridRenderer` | grid of cards | `items[]` |
| `sectionListRenderer` | generic section container | `contents[]` |

**Field rules learned:**
- Text: `runs[].text` joined, or `simpleText`.
- Thumbnails: deepest `thumbnails[]` → last is largest; upscale Google art by
  rewriting `=w60-h60` / `=s90` → `=w544-h544` / `=s544` (`hiRes`).
- Endpoints: `watchEndpoint.videoId` (+`playlistId`) for playables;
  `browseEndpoint.browseId` + `...browseEndpointContextMusicConfig.pageType` for
  navigation. `pageType` values: `MUSIC_PAGE_TYPE_ALBUM`,
  `MUSIC_PAGE_TYPE_ARTIST`, `MUSIC_PAGE_TYPE_PLAYLIST`,
  `MUSIC_PAGE_TYPE_TRACK_LYRICS`, `MUSIC_PAGE_TYPE_USER_CHANNEL`.
- A song row's 2nd flex column is `Artist • Album • Duration` as separate runs;
  separators are runs with no `navigationEndpoint`. Album runs have
  `pageType=ALBUM`; the `m:ss` run is the duration.
- Explicit badge: `musicInlineBadgeRenderer` with an accessibility label
  containing "Explicit".

---

## 6. Endpoint / browseId / param reference

| Feature | endpoint | body | Status |
|---|---|---|---|
| Search (songs) | `search` | `{ query, params:"EgWKAQIIAWoKEAkQBRAKEAMQBA==" }` | ✅ done |
| Home feed | `browse` | `{ browseId:"FEmusic_home" }` (+continuations) | ✅ done |
| Playlist / Liked | `browse` | `{ browseId:"VL"+playlistId }` (Liked = `VLLM`) | ✅ done |
| Library playlists | `browse` | `{ browseId:"FEmusic_liked_playlists" }` | ✅ done |
| Lyrics | `next`→find lyrics tab `browseId`→`browse` | `{ videoId }` then `{ browseId }` | ✅ done |
| Artist page | `browse` | `{ browseId: <UC… channelId> }` → `musicImmersiveHeaderRenderer` + top-songs `musicShelfRenderer` + carousels | ✅ done |
| Album | `browse` | `{ browseId: <MPRE…> }` → `musicResponsiveHeaderRenderer` (title/`straplineTextOne`=artist/`subtitle`/`secondSubtitle`) + tracks | ✅ done |
| Up-next / queue | `next` | `{ videoId, playlistId? }` → `playlistPanelVideoRenderer` rows (+ related/lyrics tab browseIds) | ✅ done |
| Radio / endless autoplay | `next` | `{ videoId, playlistId:"RDAMVM"+videoId }` → ~80 tracks + `nextRadioContinuationData.continuation`; page via `{ continuation }` (endless). `ytm.radio`/`queueMore` | ✅ done |
| Similar songs | `next`→related `browseId`→`browse` | `ytm.similar(videoId)` → related track list | ✅ done |
| Related | `next`→`MUSIC_PAGE_TYPE_TRACK_RELATED` tab `browseId` (`MPTR…`)→`browse` | carousels + "you might like" tracks | ✅ done |
| Search suggestions | `music/get_search_suggestions` | `{ input }` → `searchSuggestionRenderer.navigationEndpoint.searchEndpoint.query` | ✅ done |
| Search filters | `search` | `{ query, params }` (see below) → `parseSearchItems` (classify by row `navigationEndpoint` browse pageType, NOT the play overlay) | ✅ done |
| Library songs/albums/artists | `browse` | `FEmusic_liked_videos` / `FEmusic_liked_albums` / `FEmusic_library_corpus_track_artists` (artists use pageType `LIBRARY_ARTIST`, `MPLA…` ids) | ✅ done |
| History | `browse` | `FEmusic_history` → `musicShelfRenderer` per date bucket | ✅ done |
| Rate (like/dislike/clear) | `like/like` · `like/dislike` · `like/removelike` | `{ target:{ videoId } }` | ✅ done |
| Subscribe / unsubscribe | `subscription/subscribe` · `…/unsubscribe` | `{ channelIds:[id] }` (success ⇒ `actions[].addToToastAction`) | ✅ done |
| Create / delete playlist | `playlist/create` · `playlist/delete` | `{ title, description, privacyStatus }` → `{ playlistId }` · `{ playlistId }` | ✅ done |
| Edit playlist (add/remove/rename) | `browse/edit_playlist` | `{ playlistId (RAW, no VL), actions:[…] }` — `ACTION_ADD_VIDEO {addedVideoId}` / `ACTION_REMOVE_VIDEO {removedVideoId,setVideoId}` / `ACTION_SET_PLAYLIST_NAME {playlistName}` | ✅ done |

Mutations all succeed with just HTTP 200 + a `responseContext` (success = 200).
`ACTION_REMOVE_VIDEO` needs the per-item `setVideoId` (`playlistSetVideoId` on the
playlist row — now exposed on `Track.setVideoId`). They live in `ytm.ts` (`rate`,
`subscribe`, `createPlaylist`, `deletePlaylist`, `addToPlaylist`,
`removeFromPlaylist`, `renamePlaylist`) behind POST routes in `api.ts`, gated on a
captured session. **Verified reversibly** (throwaway playlist; like/subscribe
read-then-restore) so the account is left unchanged — do the same if you re-test.

**Search filter params** (the `params` field; `==` not `%3D%3D` in JSON bodies),
all probed live and verified:
songs `EgWKAQIIAWoKEAkQBRAKEAMQBA==`, videos `EgWKAQIQAWoKEAkQChAFEAMQBA==`,
albums `EgWKAQIYAWoKEAkQChAFEAMQBA==`, artists `EgWKAQIgAWoKEAkQChAFEAMQBA==`,
playlists `EgWKAQIoAWoKEAkQChAFEAMQBA==`. (In `ytm.ts` `FILTER_PARAMS`.)

---

## 7. Wiring a new feature (concrete steps)

```ts
// parse.ts — add a parser using deep-find
export function parseArtist(resp: Any) {
  const header = findOne(resp, "musicImmersiveHeaderRenderer") ?? findOne(resp, "musicVisualHeaderRenderer");
  return { name: text(header?.title), thumbnail: thumb(header),
           top: parseTracks(resp), albums: findAll(resp, "musicTwoRowItemRenderer").map(parseCard) };
}

// ytm.ts — call + parse
export async function artist(channelId: string) {
  return parseArtist(await callMusic("browse", { browseId: channelId }));
}

// api.ts — route
if (route.startsWith("/artist/") && method === "GET") {
  sendJson(res, 200, await artist(decodeURIComponent(route.slice("/artist/".length))));
  return true;
}
```

Then `src/api.ts` fetch fn + a type + the component. `tsc -b` and curl
`/api/artist/UC...` to verify.

---

## 8. Audio — SOLVED natively (no yt-dlp, no solver)

Audio now runs through the same hand-rolled path as metadata. **`stream.ts` →
`innertube.ts resolveAudio()` → native `ANDROID_VR` `player` call → direct URL →
Range proxy.** No yt-dlp, no Deno/EJS, no signature/`n` VM, no po_token.

The breakthrough (2026-06-16): the bot wall on ANDROID_VR is defeated by sending
the captured session's **`visitorData`** (and `X-Goog-Visitor-Id`) — a "blessed"
visitor id from the real logged-in browser — while sending **NO cookies**. With
it, `player` returns `OK` + ready-to-stream `adaptiveFormats` URLs (verified 8/8
on repeat, including ids that bot-walled bare). The URLs have **no
`signatureCipher`, no `n` throttle, no `pot`** — nothing to descramble.

What was tried and why this is the right answer:
- **Bare/anonymous ANDROID_VR** → bot-walled ~80% on repeat (`LOGIN_REQUIRED –
  Sign in to confirm you're not a bot`). The old failure mode.
- **ANDROID_VR + cookies + SAPISIDHASH (authed)** → rejected (status `undefined`/
  error). So mixing the cookie-auth (metadata) path into the player call breaks
  it. visitorData **yes**, cookies **no**.
- **Authed WEB_REMIX `player`** → reliable but every format is `signatureCipher`,
  and this "trusted player" has **no statically extractable** sig/`n` (no classic
  `split("")…join("")`, no helper object — it's a runtime challenge VM). Confirmed
  again on the current `base.js`: no `.set("sig"` / `get("n")`-transform anchors.
  So the WEB_REMIX premium path (itag 141=259k AAC, 774=300k webm) stays out of
  reach without a full challenge solver — **not worth it** given the VR path works.

Quality: ANDROID_VR tops out at **itag 251 opus ~150k / itag 140 AAC ~130k**.
That's the cap of this approach; premium 256k would need the WEB_REMIX cipher VM.

Implementation lives in `innertube.ts` (`callPlayer` attaches `visitorData`;
`resolveAudio` picks the top-bitrate audio format with a ready `url`) and
`stream.ts` (caches the URL ~30 min, proxies bytes with HTTP Range).

---

## 9. Gotchas & tips

- **BOM** from PowerShell `Out-File` breaks `JSON.parse` — strip `^﻿`.
- **Don't send login cookies on the audio (ANDROID_VR `player`) call** — send
  only the session's `visitorData`. Cookies on that call get it rejected; without
  visitorData it bot-walls. Cookies belong to the metadata path only.
- **`tsc -b` only typechecks files reachable from `vite.config.ts`.** A new
  server file isn't checked until something imports it.
- Vite **restarts the server when a `server/*.ts` changes** (config dep), which
  resets in-memory state (login watcher). Re-trigger `/api/auth/login` if needed.
- `noUnusedLocals`/`noUnusedParameters` are on — keep imports tidy; exported
  symbols are exempt.
- The German locale (`hl=de, gl=DE`) is intentional (UI strings match). Console
  mojibake (`ö`→`Ã¶`) is just PowerShell; the JSON is correct UTF-8.
- SAPISIDHASH is time-based but valid for a while; recompute per request (cheap).
- Be conservative with **mutation endpoints** (like/dislike, edit playlist,
  subscribe) — they change the user's real account. Confirm intent first.

---

## 10. Quick verify commands

```powershell
# typecheck
cd frontend; npx tsc -b --force
# metadata smoke test
curl.exe -s "http://127.0.0.1:5173/api/search?q=daft+punk"
curl.exe -s "http://127.0.0.1:5173/api/home"
curl.exe -s "http://127.0.0.1:5173/api/auth/status"
```
