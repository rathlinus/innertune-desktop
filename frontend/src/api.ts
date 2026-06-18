import type {
  Account,
  AlbumPage,
  ArtistCard,
  ArtistPage,
  AuthStatus,
  Episode,
  GridPage,
  HistorySection,
  HomeCard,
  Lyrics,
  Playlist,
  PlaylistPage,
  PodcastPage,
  SearchResult,
  SearchSuggestion,
  Shelf,
  SongDetails,
  StreamInfo,
  TasteArtist,
  Track,
  UpNext,
} from "./types";

// Same-origin: the API is served by Vite middleware (see server/api.ts), so
// `npm run dev` runs both the UI and the backend on one server.
export const API_BASE = "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function getHome(): Promise<Shelf[]> {
  return (await json<{ shelves: Shelf[] }>(await fetch(`${API_BASE}/home`))).shelves;
}

export async function getExplore(): Promise<Shelf[]> {
  return (await json<{ shelves: Shelf[] }>(await fetch(`${API_BASE}/explore`))).shelves;
}

export async function getCategory(browseId: string, params?: string | null): Promise<Shelf[]> {
  const qs = new URLSearchParams({ browseId });
  if (params) qs.set("params", params);
  return (await json<{ shelves: Shelf[] }>(await fetch(`${API_BASE}/category?${qs}`))).shelves;
}

// Charts (top songs + top artists/videos carousels).
export async function getCharts(): Promise<Shelf[]> {
  return (await json<{ shelves: Shelf[] }>(await fetch(`${API_BASE}/charts`))).shelves;
}

// "Stimmung & Genre" — mood/genre category chips (each opens getCategory).
export async function getMoods(): Promise<Shelf[]> {
  return (await json<{ shelves: Shelf[] }>(await fetch(`${API_BASE}/moods`))).shelves;
}

// New album & single releases (a flat grid of cards).
export async function getNewReleases(): Promise<HomeCard[]> {
  return (await json<{ results: HomeCard[] }>(await fetch(`${API_BASE}/new-releases`))).results;
}

// The onboarding "pick artists" taste profile.
export async function getTasteProfile(): Promise<TasteArtist[]> {
  return (await json<{ artists: TasteArtist[] }>(await fetch(`${API_BASE}/taste-profile`))).artists;
}

// Seed recommendations with chosen taste-profile artists.
export async function setTasteProfile(
  selections: { selectionValue: string; impressionValue: string }[]
): Promise<void> {
  await post("/taste-profile", { selections });
}

// The full grid behind a shelf's "more" link (Shelf.moreBrowseId/moreParams) —
// e.g. an artist's complete albums or singles list.
export async function getArtistAlbums(browseId: string, params?: string | null): Promise<GridPage> {
  const qs = new URLSearchParams({ browseId });
  if (params) qs.set("params", params);
  return json<GridPage>(await fetch(`${API_BASE}/artist-albums?${qs}`));
}

export async function searchTracks(query: string): Promise<Track[]> {
  const res = await fetch(
    `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=30`
  );
  return (await json<{ results: Track[] }>(res)).results;
}

export function streamUrl(videoId: string): string {
  return `${API_BASE}/stream/${videoId}`;
}

// "Herunterladen" — a URL that streams the audio with a Content-Disposition so
// the browser/Electron saves it with a real filename + matching extension.
export function downloadUrl(videoId: string, name: string): string {
  return `${API_BASE}/download/${videoId}?name=${encodeURIComponent(name)}`;
}

// "Statistiken für Interessierte" — technical details of the current stream.
export async function getPlayerInfo(videoId: string): Promise<StreamInfo> {
  return json<StreamInfo>(await fetch(`${API_BASE}/player-info/${encodeURIComponent(videoId)}`));
}

// ---------- Auth (controlled-Chrome login) ----------
export async function getAuthStatus(): Promise<AuthStatus> {
  return json<AuthStatus>(await fetch(`${API_BASE}/auth/status`));
}

// Launches the controlled Chrome window. Capture happens in the background;
// poll getAuthStatus() to see when it lands.
export async function startLogin(): Promise<void> {
  await json(await fetch(`${API_BASE}/auth/login`, { method: "POST" }));
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
}

// The signed-in account (name / @handle / avatar) for the account indicator.
export async function getAccount(): Promise<Account> {
  return json<Account>(await fetch(`${API_BASE}/account`));
}

export async function getLyrics(videoId: string): Promise<Lyrics> {
  return json<Lyrics>(await fetch(`${API_BASE}/lyrics/${videoId}`));
}

// ---------- Library ----------
export async function getPlaylists(): Promise<Playlist[]> {
  return (await json<{ playlists: Playlist[] }>(await fetch(`${API_BASE}/library/playlists`)))
    .playlists;
}

export async function getLiked(): Promise<Track[]> {
  return (await json<{ results: Track[] }>(await fetch(`${API_BASE}/library/liked`)))
    .results;
}

export async function getPlaylistTracks(
  id: string
): Promise<{ title: string; results: Track[] }> {
  return json(await fetch(`${API_BASE}/playlist/${id}`));
}

// Full playlist detail (rich header + tracks) for the playlist page.
export async function getPlaylist(id: string): Promise<PlaylistPage> {
  return json<PlaylistPage>(await fetch(`${API_BASE}/playlist/${id}`));
}

// ---------- Search suggestions + filtered search ----------
export async function getSuggestions(q: string): Promise<string[]> {
  if (!q.trim()) return [];
  return (
    await json<{ suggestions: string[] }>(
      await fetch(`${API_BASE}/suggest?q=${encodeURIComponent(q)}`)
    )
  ).suggestions;
}

// Suggestions with history-removal tokens (for the X on a history suggestion).
export async function getSuggestionsDetailed(q: string): Promise<SearchSuggestion[]> {
  if (!q.trim()) return [];
  return (
    await json<{ suggestions: SearchSuggestion[] }>(
      await fetch(`${API_BASE}/suggest?detailed=1&q=${encodeURIComponent(q)}`)
    )
  ).suggestions;
}

// Delete personal-history search suggestions (tokens from getSuggestionsDetailed).
export async function removeSearchSuggestions(tokens: string[]): Promise<void> {
  await post("/suggest/remove", { tokens });
}

// filter: "songs" | "videos" | "albums" | "artists" | "playlists"
export async function searchItems(q: string, filter: string): Promise<SearchResult[]> {
  return (
    await json<{ results: SearchResult[] }>(
      await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&filter=${filter}`)
    )
  ).results;
}

// ---------- Artist / Album ----------
export async function getArtist(browseId: string): Promise<ArtistPage> {
  return json<ArtistPage>(await fetch(`${API_BASE}/artist/${encodeURIComponent(browseId)}`));
}

export async function getAlbum(browseId: string): Promise<AlbumPage> {
  return json<AlbumPage>(await fetch(`${API_BASE}/album/${encodeURIComponent(browseId)}`));
}

// Resolve an album's audioPlaylistId (OLAK5uy_…) to its album browseId (MPREb_…).
export async function getAlbumBrowseId(audioPlaylistId: string): Promise<string | null> {
  return (
    await json<{ browseId: string | null }>(
      await fetch(`${API_BASE}/album-browse-id?audioPlaylistId=${encodeURIComponent(audioPlaylistId)}`)
    )
  ).browseId;
}

// get_song — track metadata (title/author/length/views/publish date).
export async function getSong(videoId: string): Promise<SongDetails> {
  return json<SongDetails>(await fetch(`${API_BASE}/song/${encodeURIComponent(videoId)}`));
}

// A user/channel page (non-artist uploader) — same shape as an artist page.
export async function getUser(channelId: string): Promise<ArtistPage> {
  return json<ArtistPage>(await fetch(`${API_BASE}/user/${encodeURIComponent(channelId)}`));
}

// A (podcast) channel page — same shape as an artist page.
export async function getChannel(browseId: string): Promise<ArtistPage> {
  return json<ArtistPage>(await fetch(`${API_BASE}/channel/${encodeURIComponent(browseId)}`));
}

// ---------- Podcasts / episodes ----------
export async function getPodcast(browseId: string): Promise<PodcastPage> {
  return json<PodcastPage>(await fetch(`${API_BASE}/podcast/${encodeURIComponent(browseId)}`));
}

export async function getEpisode(browseId: string): Promise<Episode> {
  return json<Episode>(await fetch(`${API_BASE}/episode/${encodeURIComponent(browseId)}`));
}

// The "Gespeicherte Folgen" saved-episodes playlist (default id "SE").
export async function getEpisodesPlaylist(playlistId = "SE"): Promise<PlaylistPage> {
  return json<PlaylistPage>(
    await fetch(`${API_BASE}/episodes-playlist?playlistId=${encodeURIComponent(playlistId)}`)
  );
}

// ---------- Up-next queue / radio / related ----------
export async function getUpNext(videoId: string, playlistId?: string): Promise<UpNext> {
  const qs = playlistId ? `?playlistId=${encodeURIComponent(playlistId)}` : "";
  return json<UpNext>(await fetch(`${API_BASE}/next/${encodeURIComponent(videoId)}${qs}`));
}

// Endless autoplay radio seeded by a track (big queue + continuation token).
export async function getRadio(videoId: string): Promise<UpNext> {
  return json<UpNext>(await fetch(`${API_BASE}/radio/${encodeURIComponent(videoId)}`));
}

// Next page of an in-progress queue/radio.
export async function queueMore(token: string): Promise<UpNext> {
  return json<UpNext>(await fetch(`${API_BASE}/queue-more?token=${encodeURIComponent(token)}`));
}

// "Similar songs" for a track.
export async function getSimilar(videoId: string): Promise<Track[]> {
  return (await json<{ tracks: Track[] }>(await fetch(`${API_BASE}/similar/${encodeURIComponent(videoId)}`)))
    .tracks;
}

export async function getRelated(
  browseId: string
): Promise<{ tracks: Track[]; shelves: Shelf[] }> {
  return json(await fetch(`${API_BASE}/related/${encodeURIComponent(browseId)}`));
}

// ---------- History + library (songs / albums / artists) ----------
export async function getHistory(): Promise<HistorySection[]> {
  return (await json<{ sections: HistorySection[] }>(await fetch(`${API_BASE}/history`)))
    .sections;
}

export async function getLibrarySongs(): Promise<Track[]> {
  return (await json<{ results: Track[] }>(await fetch(`${API_BASE}/library/songs`))).results;
}

export async function getLibraryAlbums(): Promise<HomeCard[]> {
  return (await json<{ results: HomeCard[] }>(await fetch(`${API_BASE}/library/albums`)))
    .results;
}

export async function getLibraryArtists(): Promise<ArtistCard[]> {
  return (await json<{ results: ArtistCard[] }>(await fetch(`${API_BASE}/library/artists`)))
    .results;
}

// Subscribed artists ("Abos").
export async function getLibrarySubscriptions(): Promise<ArtistCard[]> {
  return (await json<{ results: ArtistCard[] }>(await fetch(`${API_BASE}/library/subscriptions`)))
    .results;
}

// Saved podcasts in the library.
export async function getLibraryPodcasts(): Promise<HomeCard[]> {
  return (await json<{ results: HomeCard[] }>(await fetch(`${API_BASE}/library/podcasts`))).results;
}

// Uploaded ("privately owned") library content.
export async function getLibraryUploadSongs(): Promise<Track[]> {
  return (await json<{ results: Track[] }>(await fetch(`${API_BASE}/library/uploads/songs`))).results;
}

export async function getLibraryUploadAlbums(): Promise<HomeCard[]> {
  return (await json<{ results: HomeCard[] }>(await fetch(`${API_BASE}/library/uploads/albums`)))
    .results;
}

export async function getLibraryUploadArtists(): Promise<ArtistCard[]> {
  return (await json<{ results: ArtistCard[] }>(await fetch(`${API_BASE}/library/uploads/artists`)))
    .results;
}

// ---------- Mutations (write to the real account) ----------
async function post<T = { ok: boolean }>(path: string, body: unknown): Promise<T> {
  return json<T>(
    await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export type Rating = "LIKE" | "DISLIKE" | "INDIFFERENT";
export async function rate(videoId: string, rating: Rating): Promise<void> {
  await post("/rate", { videoId, rating });
}

// Like/dislike/clear a playlist or album (for others' playlists — not your own).
export async function ratePlaylist(playlistId: string, rating: Rating): Promise<void> {
  await post("/rate-playlist", { playlistId, rating });
}

// Record a play in the watch history (scrobble).
export async function addHistoryItem(videoId: string): Promise<void> {
  await post("/history/add", { videoId });
}

// Remove items from the watch history (tokens from history rows' menu).
export async function removeHistoryItems(tokens: string[]): Promise<void> {
  await post("/history/remove", { tokens });
}

// Delete an uploaded track/album from the library (entityId from upload rows).
export async function deleteUploadEntity(entityId: string): Promise<void> {
  await post("/upload/delete", { entityId });
}

// Upload a local audio file (server-side path) to the private library.
export async function uploadSong(filePath: string): Promise<boolean> {
  return (await post<{ ok: boolean }>("/upload", { filePath })).ok;
}

// Toggle library membership via the feedback endpoint (token from the track row).
export async function feedback(tokens: string[]): Promise<void> {
  await post("/feedback", { tokens });
}

// A track's current like state on the account (mirrors YouTube's thumb).
export async function getRating(videoId: string): Promise<Rating> {
  return (await json<{ status: Rating }>(await fetch(`${API_BASE}/rating/${encodeURIComponent(videoId)}`)))
    .status;
}

export async function subscribe(channelId: string, on: boolean): Promise<void> {
  await post("/subscribe", { channelId, subscribe: on });
}

export async function createPlaylist(
  title: string,
  description = "",
  privacy = "PRIVATE"
): Promise<string | null> {
  return (await post<{ ok: boolean; playlistId: string | null }>("/playlist/create", {
    title,
    description,
    privacy,
  })).playlistId;
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await post("/playlist/delete", { playlistId });
}

export async function addToPlaylist(playlistId: string, videoIds: string[]): Promise<void> {
  await post("/playlist/add", { playlistId, videoIds });
}

export async function removeFromPlaylist(
  playlistId: string,
  items: { videoId: string; setVideoId: string }[]
): Promise<void> {
  await post("/playlist/remove", { playlistId, items });
}

export async function renamePlaylist(playlistId: string, name: string): Promise<void> {
  await post("/playlist/rename", { playlistId, name });
}

// Reorder a playlist item: place `setVideoId` directly before
// `successorSetVideoId` (both are per-item setVideoIds). Omit the successor to
// move the item to the end.
export async function movePlaylistItem(
  playlistId: string,
  setVideoId: string,
  successorSetVideoId?: string | null
): Promise<void> {
  await post("/playlist/move", { playlistId, setVideoId, successorSetVideoId });
}
