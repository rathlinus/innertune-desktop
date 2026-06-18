// YouTube Music metadata — driven directly against the real youtubei/v1 API
// (see innertube.ts), no wrapper libraries. Responses are parsed from raw
// renderer JSON in parse.ts. Audio is handled separately (stream.ts).

import {
  callMusic,
  streamInfo as playerStreamInfo,
  songDetails as playerSongDetails,
  addHistoryItem as playerAddHistoryItem,
  resolveAlbumBrowseId,
  uploadSong as playerUploadSong,
  type StreamInfo,
  type SongDetails,
} from "./innertube";
import {
  parseTracks,
  parseHome,
  parseLibraryPlaylists,
  parseLibraryArtists,
  parsePlaylist,
  type PlaylistPage,
  parseCards,
  parseSearchSuggestions,
  parseSearchSuggestionsDetailed,
  parseSearchItems,
  parseArtist,
  parseAlbum,
  parseQueue,
  parseRelated,
  parseHistory,
  parseGrid,
  parseTasteProfile,
  parsePodcast,
  parseEpisode,
  findAll,
  findOne,
  text,
  type Track,
  type Shelf,
  type PlaylistCard,
  type Card,
  type SearchResult,
  type SearchSuggestion,
  type ArtistPage,
  type AlbumPage,
  type UpNext,
  type HistorySection,
  type ArtistCard,
  type GridPage,
  type TasteArtist,
  type PodcastPage,
  type Episode,
} from "./parse";

// Search filter params — the value the web client sends for each result chip.
// (Probed live; `==` not `%3D%3D` in JSON bodies.)
const SONGS_PARAMS = "EgWKAQIIAWoKEAkQBRAKEAMQBA==";
const FILTER_PARAMS: Record<string, string> = {
  songs: SONGS_PARAMS,
  videos: "EgWKAQIQAWoKEAkQChAFEAMQBA==",
  albums: "EgWKAQIYAWoKEAkQChAFEAMQBA==",
  artists: "EgWKAQIgAWoKEAkQChAFEAMQBA==",
  playlists: "EgWKAQIoAWoKEAkQChAFEAMQBA==",
};

export async function search(q: string): Promise<Track[]> {
  if (!q.trim()) return [];
  const resp = await callMusic("search", { query: q, params: SONGS_PARAMS });
  return parseTracks(resp);
}

// Filtered search (songs/videos/albums/artists/playlists) → typed results.
export async function searchItems(q: string, filter = "songs"): Promise<SearchResult[]> {
  if (!q.trim()) return [];
  const params = FILTER_PARAMS[filter] ?? SONGS_PARAMS;
  return parseSearchItems(await callMusic("search", { query: q, params }));
}

// Autocomplete suggestions for the search box.
export async function searchSuggestions(input: string): Promise<string[]> {
  if (!input.trim()) return [];
  return parseSearchSuggestions(
    await callMusic("music/get_search_suggestions", { input })
  );
}

// Suggestions with their removal tokens — lets the UI delete a personal-history
// suggestion (the X on a history row) via removeSearchSuggestions().
export async function searchSuggestionsDetailed(input: string): Promise<SearchSuggestion[]> {
  if (!input.trim()) return [];
  return parseSearchSuggestionsDetailed(
    await callMusic("music/get_search_suggestions", { input })
  );
}

// Delete personal-history search suggestions (tokens from
// searchSuggestionsDetailed). Same feedback endpoint as library toggles.
export async function removeSearchSuggestions(tokens: string[]): Promise<void> {
  const valid = tokens.filter(Boolean);
  if (!valid.length) return;
  await callMusic("feedback", { feedbackTokens: valid });
}

// Pull a continuation token from either the legacy or current shapes.
function continuationToken(resp: any): string | null {
  const legacy = findOne(resp, "nextContinuationData")?.continuation;
  if (legacy) return legacy;
  const items = findAll(resp, "continuationItemRenderer");
  for (const it of items) {
    const tok = it?.continuationEndpoint?.continuationCommand?.token;
    if (tok) return tok;
  }
  return null;
}

export async function home(limit = 12): Promise<Shelf[]> {
  let resp = await callMusic("browse", { browseId: "FEmusic_home" });
  const shelves: Shelf[] = parseHome(resp, limit);

  // The home feed lazy-loads the rest of its shelves behind continuation
  // tokens (same as scrolling the real app). Follow them until we have enough.
  let token = continuationToken(resp);
  let guard = 0;
  while (token && shelves.length < limit && guard++ < 10) {
    resp = await callMusic("browse", { continuation: token });
    shelves.push(...parseHome(resp, limit - shelves.length));
    token = continuationToken(resp);
  }
  return shelves.slice(0, limit);
}

// "Neue Alben & Singles" — the new-releases grid (a flat list of album cards).
export async function newReleases(): Promise<Card[]> {
  return parseCards(await callMusic("browse", { browseId: "FEmusic_new_releases_albums" }));
}

// The onboarding taste profile — the "pick artists you like" grid. Read it to
// list the candidate artists (+ the opaque values set_tasteprofile sends back).
export async function tasteProfile(): Promise<TasteArtist[]> {
  return parseTasteProfile(await callMusic("browse", { browseId: "FEmusic_tastebuilder" }));
}

// Seed the recommendation engine with chosen artists. `selections` are the
// selectionValue/impressionValue pairs from tasteProfile(); the web client posts
// them back to FEmusic_tastebuilder. (Mutation — changes the account's recs.)
export async function setTasteProfile(
  selections: { selectionValue: string; impressionValue: string }[]
): Promise<void> {
  const valid = selections.filter((s) => s.selectionValue && s.impressionValue);
  if (!valid.length) return;
  await callMusic("browse", {
    browseId: "FEmusic_tastebuilder",
    formData: { selectedValues: valid.map((s) => s.selectionValue) },
    // The impression values are echoed back so YT knows which were shown.
    tasteProfileSelections: valid,
  });
}

// The "Entdecken" / Explore tab — new releases, charts, moods & genres. Same
// browse/shelf shape as home, just a different feed id.
export async function explore(limit = 12): Promise<Shelf[]> {
  let resp = await callMusic("browse", { browseId: "FEmusic_explore" });
  const shelves: Shelf[] = parseHome(resp, limit);

  let token = continuationToken(resp);
  let guard = 0;
  while (token && shelves.length < limit && guard++ < 10) {
    resp = await callMusic("browse", { continuation: token });
    shelves.push(...parseHome(resp, limit - shelves.length));
    token = continuationToken(resp);
  }
  return shelves.slice(0, limit);
}

// A feed reached by tapping an Explore chip (mood/genre category, "Neu",
// "Charts", …). Same shelf shape as home/explore, so it reuses parseHome.
export async function category(browseId: string, params?: string): Promise<Shelf[]> {
  const body: Record<string, unknown> = { browseId };
  if (params) body.params = params;
  return parseHome(await callMusic("browse", body), 30);
}

// The Charts feed — top songs (a musicShelfRenderer of rows) plus top
// artists/videos carousels. Same shelf shape as home, so parseHome handles it.
export async function charts(limit = 12): Promise<Shelf[]> {
  return parseHome(await callMusic("browse", { browseId: "FEmusic_charts" }), limit);
}

// "Stimmung & Genre" — the moods & genres landing page: grids of category chips
// (each chip opens a category feed via ytm.category). parseHome emits these
// nav-button grids as chip shelves.
export async function moods(limit = 30): Promise<Shelf[]> {
  return parseHome(await callMusic("browse", { browseId: "FEmusic_moods_and_genres" }), limit);
}

function browseIdFor(playlistId: string): string {
  return playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
}

export async function playlist(id: string): Promise<PlaylistPage> {
  const resp = await callMusic("browse", { browseId: browseIdFor(id) });
  return parsePlaylist(resp);
}

export async function libraryPlaylists(): Promise<PlaylistCard[]> {
  const resp = await callMusic("browse", { browseId: "FEmusic_liked_playlists" });
  return parseLibraryPlaylists(resp);
}

export async function likedSongs(): Promise<Track[]> {
  // "LM" is the stable auto "Liked Music" playlist.
  const resp = await callMusic("browse", { browseId: "VLLM" });
  return parseTracks(resp);
}

// ---- artist / album ---------------------------------------------------------

export async function artist(browseId: string): Promise<ArtistPage> {
  return parseArtist(await callMusic("browse", { browseId }));
}

export async function album(browseId: string): Promise<AlbumPage> {
  return parseAlbum(await callMusic("browse", { browseId }));
}

// The full albums/singles/videos grid behind an artist carousel's "Mehr
// anzeigen" link (Shelf.moreBrowseId + moreParams). browseId+params come from
// that shelf header; the response is a plain grid of cards.
export async function artistAlbums(browseId: string, params?: string): Promise<GridPage> {
  const body: Record<string, unknown> = { browseId };
  if (params) body.params = params;
  return parseGrid(await callMusic("browse", body));
}

// A user/channel page (a non-artist uploader). Same browse shape as an artist
// page — header + carousels — so it reuses parseArtist; the carousels' "more"
// links (Shelf.moreBrowseId/moreParams) reach the user's full playlists/videos
// via artistAlbums().
export async function user(channelId: string): Promise<ArtistPage> {
  return parseArtist(await callMusic("browse", { browseId: channelId }));
}

// get_song — track metadata (title/author/length/views/publish date).
export async function song(videoId: string): Promise<SongDetails> {
  return playerSongDetails(videoId);
}

// get_album_browse_id — resolve an album's audioPlaylistId (OLAK5uy_…) to its
// album browseId (MPREb_…), e.g. to open the album page from a share link.
export async function albumBrowseId(audioPlaylistId: string): Promise<string | null> {
  return resolveAlbumBrowseId(audioPlaylistId);
}

// ---- podcasts / episodes / channels -----------------------------------------
// Best-effort (the dev account has no podcasts); browse wrappers over the
// documented WEB_REMIX podcast shapes — see parsePodcast/parseEpisode.

export async function podcast(browseId: string): Promise<PodcastPage> {
  return parsePodcast(await callMusic("browse", { browseId }));
}

export async function episode(browseId: string): Promise<Episode> {
  return parseEpisode(await callMusic("browse", { browseId }));
}

// A podcast channel page (browse UC…) — reuses the artist-page parser (header +
// carousels of shows).
export async function channel(browseId: string): Promise<ArtistPage> {
  return parseArtist(await callMusic("browse", { browseId }));
}

// The "saved episodes" auto-playlist (get_episodes_playlist) — a normal playlist
// browse (default id "VLSE" for the "Neue Folgen" feed).
export async function episodesPlaylist(playlistId = "SE"): Promise<PlaylistPage> {
  const id = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
  return parsePlaylist(await callMusic("browse", { browseId: id }));
}

// ---- up-next / queue / related ----------------------------------------------

// The watch queue (autoplay/radio). playlistId scopes it to an album/playlist;
// omit it for a song radio. Also surfaces the related + lyrics browseIds.
export async function upNext(videoId: string, playlistId?: string): Promise<UpNext> {
  const body: Record<string, unknown> = { videoId };
  if (playlistId) body.playlistId = playlistId;
  return parseQueue(await callMusic("next", body));
}

export async function related(browseId: string): Promise<{ tracks: Track[]; shelves: Shelf[] }> {
  return parseRelated(await callMusic("browse", { browseId }));
}

// Start an endless autoplay radio seeded by a track: a big queue + a token to
// page further (playlistId "RDAMVM<videoId>" is the radio/instant-mix id).
export async function radio(videoId: string): Promise<UpNext> {
  return parseQueue(await callMusic("next", { videoId, playlistId: `RDAMVM${videoId}` }));
}

// Next page of an in-progress queue/radio (from UpNext.continuation).
export async function queueMore(continuation: string): Promise<UpNext> {
  return parseQueue(await callMusic("next", { continuation }));
}

// "Similar songs" for a track: the watch page's related tab → its track list.
export async function similar(videoId: string): Promise<Track[]> {
  const q = parseQueue(await callMusic("next", { videoId }));
  if (!q.relatedBrowseId) return [];
  return parseRelated(await callMusic("browse", { browseId: q.relatedBrowseId })).tracks;
}

// A track's CURRENT like state on the account, read from the watch page's
// likeButtonRenderer — lets the UI mirror YouTube's filled/unfilled thumb.
export async function rating(videoId: string): Promise<Rating> {
  const resp = await callMusic("next", { videoId });
  const status = findOne(resp, "likeButtonRenderer")?.likeStatus;
  return status === "LIKE" || status === "DISLIKE" ? status : "INDIFFERENT";
}

// ---- library (songs / albums / artists) + history ---------------------------

export async function librarySongs(): Promise<Track[]> {
  return parseTracks(await callMusic("browse", { browseId: "FEmusic_liked_videos" }));
}

export async function libraryAlbums(): Promise<Card[]> {
  return parseCards(await callMusic("browse", { browseId: "FEmusic_liked_albums" }));
}

export async function libraryArtists(): Promise<ArtistCard[]> {
  return parseLibraryArtists(
    await callMusic("browse", { browseId: "FEmusic_library_corpus_track_artists" })
  );
}

export async function history(): Promise<HistorySection[]> {
  return parseHistory(await callMusic("browse", { browseId: "FEmusic_history" }));
}

// Subscribed artists (the library's "Abos"). Rows are artist
// musicResponsiveListItemRenderers, same as library artists.
export async function librarySubscriptions(): Promise<ArtistCard[]> {
  return parseLibraryArtists(
    await callMusic("browse", { browseId: "FEmusic_library_corpus_artists" })
  );
}

// Saved podcasts in the library (cards). Includes the "Podcast hinzufügen" tile.
export async function libraryPodcasts(): Promise<Card[]> {
  return parseCards(await callMusic("browse", { browseId: "FEmusic_library_non_music_audio_list" }));
}

// ---- uploads (privately-owned library) --------------------------------------

export async function libraryUploadSongs(): Promise<Track[]> {
  return parseTracks(await callMusic("browse", { browseId: "FEmusic_library_privately_owned_tracks" }));
}

export async function libraryUploadAlbums(): Promise<Card[]> {
  return parseCards(await callMusic("browse", { browseId: "FEmusic_library_privately_owned_releases" }));
}

export async function libraryUploadArtists(): Promise<ArtistCard[]> {
  return parseLibraryArtists(
    await callMusic("browse", { browseId: "FEmusic_library_privately_owned_artists" })
  );
}

// ---- mutations (write to the real account — callers must be deliberate) ------
//
// All return HTTP 200 with just a responseContext on success, so we surface a
// simple ok/throw. Playlist-edit endpoints want the RAW playlist id (no "VL").

function rawPlaylistId(id: string): string {
  return id.startsWith("VL") ? id.slice(2) : id;
}

export type Rating = "LIKE" | "DISLIKE" | "INDIFFERENT";

// Like / dislike / clear a song's rating.
export async function rate(videoId: string, rating: Rating): Promise<void> {
  const ep =
    rating === "LIKE" ? "like/like" : rating === "DISLIKE" ? "like/dislike" : "like/removelike";
  await callMusic(ep, { target: { videoId } });
}

// Like / dislike / clear a PLAYLIST or album rating (saves it to "Gefällt mir").
// Same like endpoints as songs, but with a playlistId target. (You can't rate
// your own playlist — that 404s; this is for others' playlists/albums.)
export async function ratePlaylist(playlistId: string, rating: Rating): Promise<void> {
  const ep =
    rating === "LIKE" ? "like/like" : rating === "DISLIKE" ? "like/dislike" : "like/removelike";
  await callMusic(ep, { target: { playlistId: rawPlaylistId(playlistId) } });
}

// Record a play in the account's watch history (scrobble) by pinging the track's
// playback-tracking URL — see innertube.addHistoryItem.
export async function addHistoryItem(videoId: string): Promise<void> {
  await playerAddHistoryItem(videoId);
}

// Remove items from the watch history. Tokens are the per-row feedbackTokens
// from history rows' "Aus Wiedergabeverlauf entfernen" menu item. Same feedback
// endpoint as everything else.
export async function removeHistoryItems(tokens: string[]): Promise<void> {
  const valid = tokens.filter(Boolean);
  if (!valid.length) return;
  await callMusic("feedback", { feedbackTokens: valid });
}

// Delete an uploaded ("privately owned") track or album from the library.
// entityId comes from the upload row (Track.entityId).
export async function deleteUploadEntity(entityId: string): Promise<void> {
  if (!entityId) return;
  await callMusic("music/delete_privately_owned_entity", { entityId });
}

// Upload a local audio file to the private library (see innertube.uploadSong).
export async function uploadSong(filePath: string): Promise<boolean> {
  return playerUploadSong(filePath);
}

// Toggle library membership (and "listen again") via the feedback endpoint.
// The tokens come embedded in each track row's menu (Track.libraryAddToken /
// libraryRemoveToken — see parse.ts menuExtras). Verified reversibly against the
// live account: POST feedback { feedbackTokens:[token] } → { isProcessed:true }.
export async function feedback(tokens: string[]): Promise<void> {
  const valid = tokens.filter(Boolean);
  if (!valid.length) return;
  await callMusic("feedback", { feedbackTokens: valid });
}

// "Statistics for nerds" for the current track's audio stream.
export async function streamInfo(videoId: string): Promise<StreamInfo> {
  return playerStreamInfo(videoId);
}

// Subscribe / unsubscribe to an artist channel.
export async function subscribe(channelId: string, on: boolean): Promise<void> {
  await callMusic(on ? "subscription/subscribe" : "subscription/unsubscribe", {
    channelIds: [channelId],
  });
}

// Create a playlist; returns its new id (raw, e.g. "PL…").
export async function createPlaylist(
  title: string,
  description = "",
  privacy = "PRIVATE"
): Promise<string | null> {
  const resp = await callMusic("playlist/create", {
    title,
    description,
    privacyStatus: privacy,
  });
  return resp?.playlistId ?? findOne(resp, "playlistId") ?? null;
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await callMusic("playlist/delete", { playlistId: rawPlaylistId(playlistId) });
}

export async function addToPlaylist(playlistId: string, videoIds: string[]): Promise<void> {
  if (!videoIds.length) return;
  await callMusic("browse/edit_playlist", {
    playlistId: rawPlaylistId(playlistId),
    actions: videoIds.map((addedVideoId) => ({ action: "ACTION_ADD_VIDEO", addedVideoId })),
  });
}

// Remove items — each needs the per-item setVideoId (from the playlist's tracks).
export async function removeFromPlaylist(
  playlistId: string,
  items: { videoId: string; setVideoId: string }[]
): Promise<void> {
  if (!items.length) return;
  await callMusic("browse/edit_playlist", {
    playlistId: rawPlaylistId(playlistId),
    actions: items.map((i) => ({
      action: "ACTION_REMOVE_VIDEO",
      removedVideoId: i.videoId,
      setVideoId: i.setVideoId,
    })),
  });
}

// Reorder a playlist item. Moves the item identified by `setVideoId` to sit
// directly before `successorSetVideoId` (both are per-item playlistSetVideoIds,
// from the playlist's tracks). Omit the successor to move the item to the end.
// Verified reversibly against a throwaway playlist (ACTION_MOVE_VIDEO_BEFORE →
// STATUS_SUCCEEDED).
export async function movePlaylistItem(
  playlistId: string,
  setVideoId: string,
  successorSetVideoId?: string | null
): Promise<void> {
  if (!setVideoId) return;
  const action: Record<string, unknown> = {
    action: "ACTION_MOVE_VIDEO_BEFORE",
    setVideoId,
  };
  if (successorSetVideoId) action.movedSetVideoIdSuccessor = successorSetVideoId;
  await callMusic("browse/edit_playlist", {
    playlistId: rawPlaylistId(playlistId),
    actions: [action],
  });
}

export async function renamePlaylist(playlistId: string, name: string): Promise<void> {
  await callMusic("browse/edit_playlist", {
    playlistId: rawPlaylistId(playlistId),
    actions: [{ action: "ACTION_SET_PLAYLIST_NAME", playlistName: name }],
  });
}

export interface Lyrics {
  text: string | null;
  source: string | null;
}

export async function lyrics(videoId: string): Promise<Lyrics> {
  try {
    // The watch "next" response carries a tab whose browseId opens the lyrics.
    const next = await callMusic("next", { videoId });
    const tabs = findAll(next, "tabRenderer");
    const lyricsTab = tabs.find(
      (t: any) =>
        t?.endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
          ?.browseEndpointContextMusicConfig?.pageType ===
        "MUSIC_PAGE_TYPE_TRACK_LYRICS"
    );
    const browseId = lyricsTab?.endpoint?.browseEndpoint?.browseId;
    if (!browseId) return { text: null, source: null };

    const data = await callMusic("browse", { browseId });
    const shelf = findOne(data, "musicDescriptionShelfRenderer");
    return {
      text: text(shelf?.description),
      source: text(shelf?.footer),
    };
  } catch {
    return { text: null, source: null };
  }
}
