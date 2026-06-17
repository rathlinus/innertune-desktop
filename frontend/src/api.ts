import type {
  Account,
  AlbumPage,
  ArtistCard,
  ArtistPage,
  AuthStatus,
  HistorySection,
  HomeCard,
  Lyrics,
  Playlist,
  PlaylistPage,
  SearchResult,
  Shelf,
  StreamInfo,
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
