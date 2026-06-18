// Parsers for raw InnerTube (WEB_REMIX) renderer JSON.
//
// YouTube's responses are deeply-nested "renderer" trees. Rather than pin exact
// paths (which YouTube reshuffles), we deep-find renderer nodes by type and read
// the few fields we need. This is the hand-rolled equivalent of what the wrapper
// libraries do — but driven by the live shapes we captured.

type Any = any;

// ---- tree helpers -----------------------------------------------------------

/** First node under `key` anywhere in the tree. */
export function findOne(o: Any, key: string): Any {
  if (o == null || typeof o !== "object") return null;
  if (key in o) return o[key];
  for (const k of Object.keys(o)) {
    const r = findOne(o[k], key);
    if (r) return r;
  }
  return null;
}

/** Every node under `key` anywhere in the tree (does not recurse into matches). */
export function findAll(o: Any, key: string, out: Any[] = []): Any[] {
  if (o == null || typeof o !== "object") return out;
  if (Array.isArray(o)) {
    for (const e of o) findAll(e, key, out);
    return out;
  }
  for (const k of Object.keys(o)) {
    if (k === key) out.push(o[k]);
    else findAll(o[k], key, out);
  }
  return out;
}

// ---- field helpers ----------------------------------------------------------

/** runs[].text joined, or simpleText. */
export function text(node: Any): string | null {
  if (!node) return null;
  if (typeof node === "string") return node;
  if (node.simpleText != null) return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r: Any) => r.text).join("");
  return null;
}

/**
 * The canonical stored image URL — Google's resize suffix stripped off.
 *
 * YT Music thumbnail URLs carry a resize spec (`=w544-h544-l90-rj`,
 * `=s120-c-k-...`). Those are *derived* variants the image backend generates on
 * demand, and Google rate-limits that resize path far more aggressively than
 * the original object — so synthesizing our own size (what this used to do:
 * forcing everything to `=w544`) is exactly what makes album art sporadically
 * 429. The bare URL serves the stored original straight from cache and loads
 * reliably; CSS constrains the display size, so layout is unaffected.
 */
export function hiRes(url: string | null): string | null {
  if (!url) return url;
  return url.replace(/=(?:w\d+-h\d+|s\d+)(?:-[a-z0-9]+)*$/i, "");
}

/** Largest thumbnail URL from any node containing a thumbnails[] list. */
export function thumb(node: Any): string | null {
  const t = findOne(node, "thumbnails");
  if (!Array.isArray(t) || !t.length) return null;
  return hiRes(t[t.length - 1].url ?? null);
}

interface Endpoint {
  videoId?: string;
  browseId?: string;
  playlistId?: string;
  pageType?: string;
}

/** Pull ids + pageType out of a watch/browse navigationEndpoint. */
export function endpoint(node: Any): Endpoint {
  const we = findOne(node, "watchEndpoint");
  const be = findOne(node, "browseEndpoint");
  return {
    videoId: we?.videoId,
    playlistId: we?.playlistId,
    browseId: be?.browseId,
    pageType:
      be?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
        ?.pageType,
  };
}

// ---- shared shapes ----------------------------------------------------------

export interface Track {
  videoId: string;
  title: string | null;
  artist: string;
  album: string | null;
  duration: string | null;
  durationSeconds: number | null;
  thumbnail: string | null;
  // Per-playlist-item id, only present for rows fetched from a playlist. Needed
  // to remove the item (ACTION_REMOVE_VIDEO wants both videoId + setVideoId).
  setVideoId?: string | null;
  // Context-menu extras, pulled from the row's own menuRenderer (so each row is
  // self-contained for the right-click actions). channelId/albumBrowseId drive
  // "show artist"/"show album"; the two feedback tokens toggle library membership
  // ("In Mediathek speichern" / "Aus Mediathek entfernen"), and inLibrary is the
  // current membership state read from the toggle's default label.
  channelId?: string | null;
  albumBrowseId?: string | null;
  libraryAddToken?: string | null;
  libraryRemoveToken?: string | null;
  inLibrary?: boolean;
  // Privately-owned (uploaded) tracks carry an entityId used to delete them
  // (music/delete_privately_owned_entity). Only present on upload rows.
  entityId?: string | null;
}

// Pull the context-menu extras out of a row's menuRenderer. Works for both row
// shapes (search/playlist musicResponsiveListItemRenderer and the watch-queue
// playlistPanelVideoRenderer) since both embed the same menu. Locale-independent
// where possible: artist/album come from the nav items' browse pageType; the
// library tokens come from the feedback toggle whose endpoints carry a
// feedbackToken (the "like" and "listen again" toggles are excluded — like uses
// likeEndpoint; listen-again's label has no Mediathek/library wording).
interface MenuExtras {
  channelId: string | null;
  albumBrowseId: string | null;
  libraryAddToken: string | null;
  libraryRemoveToken: string | null;
  inLibrary: boolean;
  entityId: string | null;
}
export function menuExtras(node: Any): MenuExtras {
  const menu = findOne(node, "menuRenderer");
  const out: MenuExtras = {
    channelId: null,
    albumBrowseId: null,
    libraryAddToken: null,
    libraryRemoveToken: null,
    inLibrary: false,
    entityId: findOne(node, "entityId") ?? null,
  };
  if (!menu) return out;

  for (const item of findAll(menu, "menuNavigationItemRenderer")) {
    const be = item?.navigationEndpoint?.browseEndpoint;
    const pt =
      be?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
    if (pt === "MUSIC_PAGE_TYPE_ARTIST" && !out.channelId) out.channelId = be.browseId ?? null;
    else if (pt === "MUSIC_PAGE_TYPE_ALBUM" && !out.albumBrowseId) out.albumBrowseId = be.browseId ?? null;
  }

  for (const tg of findAll(menu, "toggleMenuServiceItemRenderer")) {
    const def = text(tg.defaultText) ?? "";
    const tog = text(tg.toggledText) ?? "";
    // The library toggle (not "like", not "listen again").
    if (!/mediathek|library/i.test(def) && !/mediathek|library/i.test(tog)) continue;
    const defTok = findOne(tg.defaultServiceEndpoint, "feedbackToken");
    const togTok = findOne(tg.toggledServiceEndpoint, "feedbackToken");
    // default label "Aus … entfernen" / "Remove from …" ⇒ already in library.
    const inLib = /entfernen|remove/i.test(def);
    out.inLibrary = inLib;
    out.libraryAddToken = inLib ? togTok ?? null : defTok ?? null;
    out.libraryRemoveToken = inLib ? defTok ?? null : togTok ?? null;
    break;
  }
  return out;
}

export interface Card {
  kind: "video" | "playlist" | "album";
  videoId?: string;
  playlistId?: string | null;
  browseId?: string | null;
  title: string | null;
  subtitle: string | null;
  thumbnail: string | null;
  aspect: "video" | "square";
  explicit: boolean;
}

function flexText(col: Any): Any {
  return col?.musicResponsiveListItemFlexColumnRenderer?.text;
}

function isExplicit(node: Any): boolean {
  const badge = findOne(node, "musicInlineBadgeRenderer");
  const label = badge?.accessibilityData?.accessibilityData?.label || "";
  return /explicit/i.test(label);
}

// musicResponsiveListItemRenderer -> Track
export function parseSongRow(r: Any): Track | null {
  const ep = endpoint(
    findOne(r, "musicPlayButtonRenderer")?.playNavigationEndpoint ?? r
  );
  const videoId = ep.videoId;
  if (!videoId) return null;

  const cols = r.flexColumns ?? [];
  const title = text(flexText(cols[0]));

  // Second column carries "Artist • Album • Duration" as separate runs; the
  // dotted separators are runs without navigationEndpoint.
  const subRuns: Any[] = flexText(cols[1])?.runs ?? [];
  const named = subRuns.filter((x: Any) => x.text && x.text.trim() !== "•" && x.text.trim());
  const artists: string[] = [];
  let album: string | null = null;
  let duration: string | null = null;
  for (const run of named) {
    const t = run.text.trim();
    if (/^\d+:\d{2}$/.test(t)) duration = t;
    else if (run.navigationEndpoint) {
      const pt = endpoint(run.navigationEndpoint).pageType;
      if (pt === "MUSIC_PAGE_TYPE_ALBUM") album = t;
      else artists.push(t);
    }
  }
  // fixedColumns sometimes holds the duration instead.
  if (!duration) {
    const fixed = r.fixedColumns?.[0];
    duration = text(fixed?.musicResponsiveListItemFixedColumnRenderer?.text);
  }
  const secs = duration
    ? duration.split(":").reduce((a, b) => a * 60 + Number(b), 0)
    : null;

  return {
    videoId,
    title,
    artist: artists.join(", "),
    album,
    duration,
    durationSeconds: secs,
    thumbnail: thumb(r),
    setVideoId: r.playlistItemData?.playlistSetVideoId ?? null,
    ...menuExtras(r),
  };
}

// musicTwoRowItemRenderer -> Card
export function parseCard(r: Any): Card | null {
  const thumbnail = thumb(r);
  const ep = endpoint(r.navigationEndpoint ?? r);
  const title = text(r.title);
  const subtitle = text(r.subtitle);
  const explicit = isExplicit(r);
  const wide = /16_9|RECTANGLE/.test(r.aspectRatio || "");

  if (ep.videoId) {
    return {
      kind: "video",
      videoId: ep.videoId,
      title,
      subtitle,
      thumbnail,
      aspect: wide ? "video" : "square",
      explicit,
    };
  }
  const isAlbum = ep.pageType === "MUSIC_PAGE_TYPE_ALBUM";
  return {
    kind: isAlbum ? "album" : "playlist",
    browseId: ep.browseId ?? null,
    playlistId: ep.playlistId ?? (ep.browseId?.startsWith("VL") ? ep.browseId.slice(2) : null),
    title,
    subtitle,
    thumbnail,
    aspect: "square",
    explicit,
  };
}

// ---- top-level response parsers ---------------------------------------------

export function parseTracks(resp: Any): Track[] {
  const rows = findAll(resp, "musicResponsiveListItemRenderer");
  const out: Track[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const t = parseSongRow(r);
    if (t && !seen.has(t.videoId)) {
      seen.add(t.videoId);
      out.push(t);
    }
  }
  return out;
}

// A pill that navigates to another feed/category page (Explore's mood & genre
// chips, and the "Neu"/"Charts"/… quick-links).
export interface Chip {
  text: string | null;
  browseId: string | null;
  params: string | null;
  color: string | null; // CSS color from the renderer's ARGB, when present
  icon: string | null; // renderer iconType, e.g. "TRENDING_UP" (quick-links)
}

export interface Shelf {
  title: string | null;
  cards: Card[];
  chips?: Chip[]; // present instead of cards for nav-button shelves
  // The shelf header's "more" target (browse the full list — e.g. an artist's
  // complete albums/singles grid, or a home shelf's dedicated page). Drives a
  // "Mehr anzeigen" link; fetch via ytm.artistAlbums / category.
  moreBrowseId?: string | null;
  moreParams?: string | null;
}

// uint32 ARGB (e.g. 4294961024) -> "#rrggbb".
function argbToHex(n: Any): string | null {
  if (typeof n !== "number") return null;
  const hex = (n & 0xffffff).toString(16).padStart(6, "0");
  return `#${hex}`;
}

// musicNavigationButtonRenderer -> Chip
function parseChip(b: Any): Chip | null {
  const label = text(b?.buttonText);
  const ep = b?.clickCommand?.browseEndpoint;
  if (!label || !ep?.browseId) return null;
  return {
    text: label,
    browseId: ep.browseId,
    params: ep.params ?? null,
    color: argbToHex(b?.solid?.leftStripeColor),
    icon: b?.iconStyle?.icon?.iconType ?? null,
  };
}

// A song row (musicResponsiveListItemRenderer) shown inside a feed shelf —
// e.g. Explore's charts/top-songs — rendered as a playable video card.
function cardFromSongRow(r: Any): Card | null {
  const t = parseSongRow(r);
  if (!t || !t.thumbnail) return null;
  return {
    kind: "video",
    videoId: t.videoId,
    title: t.title,
    subtitle: t.artist || null,
    thumbnail: t.thumbnail,
    aspect: "square",
    explicit: false,
  };
}

// Title of a feed shelf, across the header shapes the feeds use (carousel /
// grid / plain list shelf).
function shelfTitle(shelf: Any): string | null {
  return text(
    shelf?.header?.musicCarouselShelfBasicHeaderRenderer?.title ??
      shelf?.header?.gridHeaderRenderer?.title ??
      shelf?.title ??
      findOne(shelf?.header, "title")
  );
}

// The shelf header's "more" target (the carousel "Mehr anzeigen" arrow, or the
// header title link) — a browseEndpoint scoped to the header only, so card
// browseEndpoints inside the shelf body aren't mistaken for it.
function shelfMore(shelf: Any): { browseId: string; params: string | null } | null {
  const be = findOne(shelf?.header, "browseEndpoint");
  return be?.browseId ? { browseId: be.browseId, params: be.params ?? null } : null;
}

// Every card in a shelf subtree: two-row card items plus song rows.
function shelfCards(shelf: Any): Card[] {
  const cards: Card[] = [];
  for (const it of findAll(shelf, "musicTwoRowItemRenderer")) {
    const c = parseCard(it);
    if (c && c.thumbnail) cards.push(c);
  }
  for (const r of findAll(shelf, "musicResponsiveListItemRenderer")) {
    const c = cardFromSongRow(r);
    if (c) cards.push(c);
  }
  return cards;
}

// The home / explore feeds. Walk the section list in document order and turn
// each shelf into a {title, cards}. Handles every shelf shape these feeds use —
// carousels, immersive carousels, grids and plain list shelves — so sections
// that aren't two-row-card carousels (charts, "new releases" grids, …) are no
// longer silently dropped.
export function parseHome(resp: Any, limit = 12): Shelf[] {
  const sections: Any[] = [];
  for (const sl of findAll(resp, "sectionListRenderer")) {
    if (Array.isArray(sl?.contents)) sections.push(...sl.contents);
  }
  // Continuation pages carry their shelves under continuationItems instead.
  for (const ci of findAll(resp, "continuationItems")) {
    if (Array.isArray(ci)) sections.push(...ci);
  }

  const shelves: Shelf[] = [];
  const seen = new Set<string>();
  for (const sec of sections) {
    const shelf =
      sec.musicCarouselShelfRenderer ??
      sec.musicImmersiveCarouselShelfRenderer ??
      sec.gridRenderer ??
      sec.musicShelfRenderer;
    if (!shelf) continue;
    const title = shelfTitle(shelf);
    const cards = shelfCards(shelf);
    if (!cards.length) {
      // No cards — but a shelf of navigation buttons (mood/genre chips, the
      // "Neu"/"Charts" quick-links) is still meaningful, so emit it as chips.
      const chips = findAll(shelf, "musicNavigationButtonRenderer")
        .map(parseChip)
        .filter((c): c is Chip => !!c);
      if (!chips.length) continue;
      const key = `${title ?? ""}|${chips[0].browseId}|${chips[0].params ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      shelves.push({ title, cards: [], chips });
      if (shelves.length >= limit) break;
      continue;
    }
    const key = `${title ?? ""}|${cards[0].videoId ?? cards[0].browseId ?? cards[0].playlistId ?? ""}`;
    if (seen.has(key)) continue; // de-dupe if a shelf appears in both list + continuation
    seen.add(key);
    const more = shelfMore(shelf);
    shelves.push({ title, cards, moreBrowseId: more?.browseId ?? null, moreParams: more?.params ?? null });
    if (shelves.length >= limit) break;
  }
  return shelves;
}

export interface PlaylistCard {
  playlistId: string;
  title: string | null;
  thumbnail: string | null;
  count: string | number | null;
}

export function parseLibraryPlaylists(resp: Any): PlaylistCard[] {
  const out: PlaylistCard[] = [];
  const seen = new Set<string>();
  for (const r of findAll(resp, "musicTwoRowItemRenderer")) {
    const ep = endpoint(r.navigationEndpoint ?? r);
    const pid = ep.playlistId ?? (ep.browseId?.startsWith("VL") ? ep.browseId.slice(2) : ep.browseId);
    // Only playlists/albums, not artist subscriptions.
    if (!pid || ep.pageType === "MUSIC_PAGE_TYPE_ARTIST" || ep.pageType === "MUSIC_PAGE_TYPE_USER_CHANNEL") continue;
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push({
      playlistId: pid,
      title: text(r.title),
      thumbnail: thumb(r),
      count: text(r.subtitle),
    });
  }
  return out;
}

export interface PlaylistPage {
  title: string | null;
  owner: string | null; // "Linus Rath" — straplineTextOne, or the facepile byline
  ownerThumbnail: string | null; // owner avatar
  subtitle: string | null; // "Autom. Playlist • 2026"
  secondSubtitle: string | null; // "383 Songs • Über 5 Stunden"
  description: string | null;
  thumbnail: string | null; // playlist cover art
  results: Track[];
}

// Playlist detail (browse VL…). The rich header (musicResponsiveHeaderRenderer)
// gives art, title, owner, the "type • year" + "n Songs • duration" subtitles
// and (sometimes) a description — everything the playlist page needs. Still
// returns { title, results } too, so existing callers keep working.
export function parsePlaylist(resp: Any): PlaylistPage {
  const h =
    findOne(resp, "musicResponsiveHeaderRenderer") ??
    findOne(resp, "musicEditablePlaylistDetailHeaderRenderer") ??
    findOne(resp, "musicDetailHeaderRenderer");
  const facepile = findOne(h, "musicFacepileRenderer");
  const description =
    text(findOne(resp, "musicDescriptionShelfRenderer")?.description) ??
    text(h?.description) ??
    null;
  return {
    title: text(h?.title),
    owner: text(h?.straplineTextOne) ?? text(facepile?.text) ?? null,
    ownerThumbnail: thumb(h?.straplineThumbnail) ?? thumb(facepile) ?? null,
    subtitle: text(h?.subtitle),
    secondSubtitle: text(h?.secondSubtitle),
    description,
    thumbnail: thumb(h?.thumbnail),
    results: parseTracks(resp),
  };
}

/** Every musicTwoRowItemRenderer in the tree as a Card (grids/carousels). */
export function parseCards(resp: Any): Card[] {
  return findAll(resp, "musicTwoRowItemRenderer")
    .map(parseCard)
    .filter((c): c is Card => !!c);
}

// ---- search suggestions (music/get_search_suggestions) ----------------------

// The autocomplete dropdown: each searchSuggestionRenderer carries the query to
// run in navigationEndpoint.searchEndpoint.query (the visible runs just bold the
// typed prefix). We return de-duped query strings.
export function parseSearchSuggestions(resp: Any): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of findAll(resp, "searchSuggestionRenderer")) {
    const q = s?.navigationEndpoint?.searchEndpoint?.query ?? text(s?.suggestion);
    if (q && !seen.has(q)) {
      seen.add(q);
      out.push(q);
    }
  }
  return out;
}

// ---- generic search results (filter chips) ----------------------------------

export interface SearchResult {
  kind: "song" | "album" | "artist" | "playlist";
  videoId?: string;
  browseId?: string;
  playlistId?: string | null;
  title: string | null;
  subtitle: string | null;
  thumbnail: string | null;
  duration: string | null;
  explicit: boolean;
  // Context-menu extras (song rows only) so search has the full right-click menu.
  channelId?: string | null;
  albumBrowseId?: string | null;
  libraryAddToken?: string | null;
  libraryRemoveToken?: string | null;
  inLibrary?: boolean;
}

// Map a browse pageType to our result kind (null ⇒ not a browse target).
function browseKindOf(pageType?: string): SearchResult["kind"] | null {
  switch (pageType) {
    case "MUSIC_PAGE_TYPE_ALBUM":
      return "album";
    case "MUSIC_PAGE_TYPE_ARTIST":
    case "MUSIC_PAGE_TYPE_USER_CHANNEL":
    case "MUSIC_PAGE_TYPE_LIBRARY_ARTIST":
      return "artist";
    case "MUSIC_PAGE_TYPE_PLAYLIST":
      return "playlist";
    default:
      return null;
  }
}

// Filtered search (songs/videos/albums/artists/playlists) returns rows as
// musicResponsiveListItemRenderer regardless of type. The row's OWN tap target
// (navigationEndpoint) decides the type: a browseEndpoint ⇒ album/artist/playlist
// — this wins over the play-overlay's watchEndpoint, which albums/playlists also
// carry (to start their first track). Only a bare playable ⇒ song/video.
export function parseSearchItems(resp: Any): SearchResult[] {
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (const r of findAll(resp, "musicResponsiveListItemRenderer")) {
    const cols = r.flexColumns ?? [];
    const title = text(flexText(cols[0]));
    const subtitle = text(flexText(cols[1]));
    const explicit = isExplicit(r);

    const navEp = r.navigationEndpoint ? endpoint(r.navigationEndpoint) : {};
    const browseKind = browseKindOf(navEp.pageType);
    if (navEp.browseId && browseKind) {
      if (seen.has("b:" + navEp.browseId)) continue;
      seen.add("b:" + navEp.browseId);
      out.push({
        kind: browseKind,
        browseId: navEp.browseId,
        playlistId: navEp.browseId.startsWith("VL") ? navEp.browseId.slice(2) : navEp.playlistId ?? null,
        title,
        subtitle,
        thumbnail: thumb(r),
        duration: null,
        explicit,
      });
      continue;
    }

    const videoId =
      endpoint(findOne(r, "musicPlayButtonRenderer")?.playNavigationEndpoint ?? {}).videoId ??
      navEp.videoId;
    if (!videoId) continue;
    if (seen.has("v:" + videoId)) continue;
    seen.add("v:" + videoId);
    const subRuns: Any[] = flexText(cols[1])?.runs ?? [];
    let duration: string | null =
      subRuns.map((x: Any) => x.text?.trim()).find((t: string) => /^\d+:\d{2}$/.test(t || "")) ?? null;
    if (!duration) {
      const fixed = r.fixedColumns?.[0];
      duration = text(fixed?.musicResponsiveListItemFixedColumnRenderer?.text);
    }
    out.push({ kind: "song", videoId, title, subtitle, thumbnail: thumb(r), duration, explicit, ...menuExtras(r) });
  }
  return out;
}

// ---- artist page (browse UC…) -----------------------------------------------

export interface ArtistPage {
  name: string | null;
  thumbnail: string | null;
  subscribers: string | null;
  channelId: string | null; // for subscribe — may differ from the browse id
  subscribed: boolean;
  description: string | null;
  songs: Track[];
  shelves: Shelf[];
}

export function parseArtist(resp: Any): ArtistPage {
  const header =
    findOne(resp, "musicImmersiveHeaderRenderer") ?? findOne(resp, "musicVisualHeaderRenderer");
  const sub = findOne(header, "subscribeButtonRenderer");
  // The single musicShelfRenderer on an artist page is the "top songs" list;
  // every other section is a musicCarouselShelfRenderer of cards.
  const topShelf = findOne(resp, "musicShelfRenderer");
  return {
    name: text(header?.title),
    thumbnail: thumb(header),
    subscribers: text(sub?.subscriberCountText),
    channelId: sub?.channelId ?? null,
    subscribed: !!sub?.subscribed,
    description: text(findOne(resp, "musicDescriptionShelfRenderer")?.description),
    songs: topShelf ? parseTracks(topShelf) : [],
    shelves: parseHome(resp, 20),
  };
}

// ---- album / single (browse MPRE…) ------------------------------------------

export interface AlbumPage {
  title: string | null;
  artist: string | null;
  subtitle: string | null; // e.g. "EP • 1997"
  secondSubtitle: string | null; // e.g. "4 Songs • 23 Minuten"
  thumbnail: string | null;
  tracks: Track[];
}

export function parseAlbum(resp: Any): AlbumPage {
  const h =
    findOne(resp, "musicResponsiveHeaderRenderer") ??
    findOne(resp, "musicDetailHeaderRenderer") ??
    findOne(resp, "musicEditablePlaylistDetailHeaderRenderer");
  return {
    title: text(h?.title),
    artist: text(h?.straplineTextOne),
    subtitle: text(h?.subtitle),
    secondSubtitle: text(h?.secondSubtitle),
    thumbnail: thumb(h),
    tracks: parseTracks(resp),
  };
}

// ---- up-next / queue (next) --------------------------------------------------

// playlistPanelVideoRenderer -> Track (the watch queue uses a different row shape
// than search/playlist: title.runs, longBylineText for artist, lengthText, and a
// top-level videoId).
function parsePanelVideo(n: Any): Track | null {
  const videoId = n?.videoId ?? endpoint(n?.navigationEndpoint ?? {}).videoId;
  if (!videoId) return null;
  const runs: Any[] = n?.longBylineText?.runs ?? [];
  const artists = runs
    .filter((r) => r?.navigationEndpoint && endpoint(r.navigationEndpoint).pageType === "MUSIC_PAGE_TYPE_ARTIST")
    .map((r) => r.text);
  const artist = artists.length ? artists.join(", ") : runs[0]?.text ?? "";
  const duration = text(n?.lengthText);
  const secs = duration ? duration.split(":").reduce((a, b) => a * 60 + Number(b), 0) : null;
  return {
    videoId,
    title: text(n?.title),
    artist,
    album: null,
    duration,
    durationSeconds: secs,
    thumbnail: thumb(n),
    ...menuExtras(n),
  };
}

export interface UpNext {
  tracks: Track[];
  // Token to fetch the next page of the (endless) radio queue — re-POST `next`
  // with { continuation }. Null when the queue isn't a radio (e.g. plain watch).
  continuation: string | null;
  relatedBrowseId: string | null;
  lyricsBrowseId: string | null;
}

// The radio/queue continuation token (prefer the radio form).
function queueToken(resp: Any): string | null {
  const radio = findOne(resp, "nextRadioContinuationData")?.continuation;
  if (radio) return radio;
  const legacy = findOne(resp, "nextContinuationData")?.continuation;
  if (legacy) return legacy;
  for (const c of findAll(resp, "continuationCommand")) if (c?.token) return c.token;
  return null;
}

// A song-identity key that ignores the OMV-vs-ATV distinction (YouTube hands
// out different videoIds for the music video vs the audio track of one song).
// We key on the title only — the artist string is unreliable (cards prefix a
// type label like "Titel •" and append view counts, which never match the
// radio's clean byline). The title is normalized to drop *video-type* markers
// ("(Official Video)", "(Lyric Video)", a truncated "(Lyric Vid…") while
// keeping meaningful parentheticals like "(… Remix)" so a remix is not merged
// with the original. Must match the frontend copy in usePlayer.ts.
const VIDEO_MARKER = /[([][^)\]]*\b(?:official|video|lyric|lyrics|audio|visuali\w*|clip|mv|hd|4k|hq)\b[^)\]]*[)\]]/g;
export function songKey(title: string | null): string {
  return (title ?? "")
    .toLowerCase()
    .replace(VIDEO_MARKER, " ")
    .replace(/[([][^)\]]*$/, " ") // a dangling "(… from a truncated title
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseQueue(resp: Any): UpNext {
  // YouTube's radio queue lists the same song twice — as a music video (OMV)
  // and an audio track (ATV). Collapse those to one entry, preferring the audio
  // track, so the player doesn't play "the video then the audio" back to back.
  const tracks: Track[] = [];
  const chosenAtv: boolean[] = [];
  const idxByKey = new Map<string, number>();
  for (const n of findAll(resp, "playlistPanelVideoRenderer")) {
    const t = parsePanelVideo(n);
    if (!t) continue;
    const atv = findOne(n, "watchEndpointMusicConfig")?.musicVideoType === "MUSIC_VIDEO_TYPE_ATV";
    const key = t.title ? songKey(t.title) : t.videoId;
    const at = idxByKey.get(key);
    if (at == null) {
      idxByKey.set(key, tracks.length);
      tracks.push(t);
      chosenAtv.push(atv);
    } else if (atv && !chosenAtv[at]) {
      // Replace the music-video version with the clean audio track (in place,
      // so queue order is preserved).
      tracks[at] = t;
      chosenAtv[at] = true;
    }
  }
  let relatedBrowseId: string | null = null;
  let lyricsBrowseId: string | null = null;
  for (const tb of findAll(resp, "tabRenderer")) {
    const be = tb?.endpoint?.browseEndpoint;
    const pt =
      be?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
    if (pt === "MUSIC_PAGE_TYPE_TRACK_RELATED") relatedBrowseId = be.browseId;
    else if (pt === "MUSIC_PAGE_TYPE_TRACK_LYRICS") lyricsBrowseId = be.browseId;
  }
  return { tracks, continuation: queueToken(resp), relatedBrowseId, lyricsBrowseId };
}

// Related (browse MPTR…): a mix of card carousels and a "you might like" track
// list — reuse the home + tracks parsers.
export function parseRelated(resp: Any): { tracks: Track[]; shelves: Shelf[] } {
  return { tracks: parseTracks(resp), shelves: parseHome(resp, 20) };
}

// ---- history (browse FEmusic_history) ---------------------------------------

export interface HistorySection {
  title: string | null; // date bucket: "Heute" / "Gestern" / …
  tracks: Track[];
}

export function parseHistory(resp: Any): HistorySection[] {
  const out: HistorySection[] = [];
  for (const sh of findAll(resp, "musicShelfRenderer")) {
    const tracks = parseTracks(sh);
    if (tracks.length) out.push({ title: text(sh.title), tracks });
  }
  return out;
}

// ---- library artists (browse FEmusic_library_corpus_track_artists) ----------

export interface ArtistCard {
  browseId: string;
  name: string | null;
  subtitle: string | null;
  thumbnail: string | null;
}

// ---- grid page (artist's full albums/singles, browse browseId+params) -------

export interface GridPage {
  title: string | null; // the grid header, e.g. "Alben" / "Singles"
  cards: Card[];
}

// A plain grid of cards behind a shelf's "more" link. Reuses parseCards; the
// title comes from the grid/musicHeader title.
export function parseGrid(resp: Any): GridPage {
  const title = text(
    findOne(resp, "gridHeaderRenderer")?.title ??
      findOne(resp, "musicHeaderRenderer")?.title ??
      findOne(resp, "header")?.title
  );
  return { title, cards: parseCards(resp) };
}

export function parseLibraryArtists(resp: Any): ArtistCard[] {
  const out: ArtistCard[] = [];
  const seen = new Set<string>();
  for (const r of findAll(resp, "musicResponsiveListItemRenderer")) {
    const ep = endpoint(r.navigationEndpoint ?? r);
    // Library artists use pageType LIBRARY_ARTIST with an MPLA-prefixed browseId
    // (regular artists are MUSIC_PAGE_TYPE_ARTIST / UC…). Accept either.
    if (!ep.browseId || !browseKindOf(ep.pageType)) continue;
    if (browseKindOf(ep.pageType) !== "artist") continue;
    if (seen.has(ep.browseId)) continue;
    seen.add(ep.browseId);
    const cols = r.flexColumns ?? [];
    out.push({
      browseId: ep.browseId,
      name: text(flexText(cols[0])),
      subtitle: text(flexText(cols[1])),
      thumbnail: thumb(r),
    });
  }
  return out;
}

// ---- taste profile (browse FEmusic_tastebuilder) ----------------------------

// The onboarding "pick artists you like" grid. Each tastebuilderItemRenderer
// carries the artist name plus the opaque selection/impression values that
// set_tasteprofile sends back. (Field names per the live renderer.)
export interface TasteArtist {
  name: string | null;
  selectionValue: string | null;
  impressionValue: string | null;
  thumbnail: string | null;
}

export function parseTasteProfile(resp: Any): TasteArtist[] {
  const out: TasteArtist[] = [];
  const seen = new Set<string>();
  for (const it of findAll(resp, "tastebuilderItemRenderer")) {
    const name = text(it?.title);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({
      name,
      selectionValue: it?.selectionFormValue ?? null,
      impressionValue: it?.impressionValue ?? null,
      thumbnail: thumb(it),
    });
  }
  return out;
}

// ---- podcast / episode (browse) ---------------------------------------------
//
// Best-effort parsers: the dev account has no subscribed podcasts to capture, so
// these follow the documented WEB_REMIX podcast shapes (musicResponsiveHeader +
// musicMultiRowListItemRenderer episode rows) and lean on deep-find so they
// degrade gracefully rather than crash.

export interface Episode {
  videoId: string | null;
  title: string | null;
  description: string | null;
  date: string | null;
  duration: string | null;
  thumbnail: string | null;
}

function parseEpisodeRow(n: Any): Episode {
  const onTap = n?.onTap ?? n?.navigationEndpoint ?? n;
  return {
    videoId: findOne(onTap, "videoId") ?? n?.videoId ?? null,
    title: text(n?.title),
    description: text(n?.description) ?? text(findOne(n, "musicMultilineTextRenderer")),
    date: text(n?.subtitle),
    duration: text(findOne(n, "lengthText")),
    thumbnail: thumb(n),
  };
}

export interface PodcastPage {
  title: string | null;
  author: string | null;
  description: string | null;
  thumbnail: string | null;
  episodes: Episode[];
}

export function parsePodcast(resp: Any): PodcastPage {
  const h =
    findOne(resp, "musicResponsiveHeaderRenderer") ??
    findOne(resp, "musicDetailHeaderRenderer");
  return {
    title: text(h?.title),
    author: text(h?.straplineTextOne) ?? text(h?.subtitle),
    description:
      text(findOne(resp, "musicDescriptionShelfRenderer")?.description) ??
      text(h?.description),
    thumbnail: thumb(h),
    episodes: findAll(resp, "musicMultiRowListItemRenderer").map(parseEpisodeRow),
  };
}

// A single episode page → its (one) episode detail plus the host podcast title.
export function parseEpisode(resp: Any): Episode {
  const row = findAll(resp, "musicMultiRowListItemRenderer")[0];
  if (row) return parseEpisodeRow(row);
  const h =
    findOne(resp, "musicResponsiveHeaderRenderer") ??
    findOne(resp, "musicDetailHeaderRenderer");
  return {
    videoId: findOne(resp, "videoId") ?? null,
    title: text(h?.title),
    description:
      text(findOne(resp, "musicDescriptionShelfRenderer")?.description) ??
      text(h?.description),
    date: text(h?.subtitle),
    duration: null,
    thumbnail: thumb(h),
  };
}

// ---- detailed search suggestions (with removable-history tokens) ------------

// Like parseSearchSuggestions but also surfaces the feedbackToken that
// remove_search_suggestions needs to delete a personal-history suggestion.
export interface SearchSuggestion {
  query: string;
  fromHistory: boolean;
  removeToken: string | null;
}

export function parseSearchSuggestionsDetailed(resp: Any): SearchSuggestion[] {
  const out: SearchSuggestion[] = [];
  const seen = new Set<string>();
  for (const s of findAll(resp, "searchSuggestionRenderer")) {
    const q = s?.navigationEndpoint?.searchEndpoint?.query ?? text(s?.suggestion);
    if (!q || seen.has(q)) continue;
    seen.add(q);
    const removeToken = findOne(s, "feedbackToken");
    out.push({ query: q, fromHistory: !!removeToken, removeToken: removeToken ?? null });
  }
  return out;
}
