// Vite plugin: serves the whole backend API as middleware on the SAME dev
// server as the React app, so `npm run dev` starts everything (and there's no
// CORS since it's same-origin).

import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  home,
  explore,
  category,
  charts,
  moods,
  newReleases,
  tasteProfile,
  setTasteProfile,
  search,
  searchItems,
  searchSuggestions,
  searchSuggestionsDetailed,
  removeSearchSuggestions,
  playlist,
  libraryPlaylists,
  librarySongs,
  libraryAlbums,
  libraryArtists,
  librarySubscriptions,
  libraryPodcasts,
  libraryUploadSongs,
  libraryUploadAlbums,
  libraryUploadArtists,
  likedSongs,
  lyrics,
  artist,
  artistAlbums,
  album,
  albumBrowseId,
  user,
  song,
  podcast,
  episode,
  channel,
  episodesPlaylist,
  upNext,
  radio,
  queueMore,
  similar,
  rating,
  related,
  history,
  rate,
  ratePlaylist,
  feedback,
  addHistoryItem,
  removeHistoryItems,
  deleteUploadEntity,
  uploadSong,
  streamInfo,
  subscribe,
  createPlaylist,
  deletePlaylist,
  addToPlaylist,
  removeFromPlaylist,
  movePlaylistItem,
  renamePlaylist,
} from "./ytm";
import { streamAudio, downloadAudio } from "./stream";
import { NotAuthedError } from "./innertube";
import {
  startLogin,
  isAuthenticated,
  getLoginState,
  logout,
} from "./chrome";
import { account } from "./account";

function sendJson(res: ServerResponse, code: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(data);
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || "", "http://localhost");
  const p = url.pathname;
  if (!p.startsWith("/api/")) return false;

  const route = p.slice(4); // strip "/api"
  const method = req.method || "GET";

  try {
    // ---- streaming ----
    // `hq=1` opts into the premium itag-141 path (falls back automatically).
    const hq = url.searchParams.get("hq") === "1";
    if (route.startsWith("/stream/")) {
      await streamAudio(decodeURIComponent(route.slice("/stream/".length)), req, res, hq);
      return true;
    }
    if (route.startsWith("/download/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/download/".length));
      const name = url.searchParams.get("name") || id;
      await downloadAudio(id, name, res, hq);
      return true;
    }
    if (route.startsWith("/player-info/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/player-info/".length));
      sendJson(res, 200, await streamInfo(id, hq));
      return true;
    }

    // ---- metadata ----
    if (route === "/home" && method === "GET") {
      sendJson(res, 200, { shelves: await home() });
      return true;
    }
    if (route === "/explore" && method === "GET") {
      sendJson(res, 200, { shelves: await explore() });
      return true;
    }
    if (route === "/charts" && method === "GET") {
      sendJson(res, 200, { shelves: await charts() });
      return true;
    }
    if (route === "/moods" && method === "GET") {
      sendJson(res, 200, { shelves: await moods() });
      return true;
    }
    if (route === "/new-releases" && method === "GET") {
      sendJson(res, 200, { results: await newReleases() });
      return true;
    }
    if (route === "/taste-profile" && method === "GET") {
      sendJson(res, 200, { artists: await tasteProfile() });
      return true;
    }
    if (route === "/category" && method === "GET") {
      const browseId = url.searchParams.get("browseId") || "";
      const params = url.searchParams.get("params") || undefined;
      sendJson(res, 200, { shelves: browseId ? await category(browseId, params) : [] });
      return true;
    }
    if (route === "/search" && method === "GET") {
      const q = url.searchParams.get("q") || "";
      const filter = url.searchParams.get("filter");
      // With a filter chip → typed mixed results; without → songs (back-compat).
      if (filter) {
        sendJson(res, 200, { results: await searchItems(q, filter) });
      } else {
        sendJson(res, 200, { results: await search(q) });
      }
      return true;
    }
    if (route === "/suggest" && method === "GET") {
      const q = url.searchParams.get("q") || "";
      // detailed=1 → suggestions with removal tokens; default → plain strings.
      if (url.searchParams.get("detailed")) {
        sendJson(res, 200, { suggestions: await searchSuggestionsDetailed(q) });
      } else {
        sendJson(res, 200, { suggestions: await searchSuggestions(q) });
      }
      return true;
    }
    if (route.startsWith("/playlist/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/playlist/".length));
      sendJson(res, 200, await playlist(id));
      return true;
    }
    if (route.startsWith("/artist/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/artist/".length));
      sendJson(res, 200, await artist(id));
      return true;
    }
    if (route === "/artist-albums" && method === "GET") {
      const browseId = url.searchParams.get("browseId") || "";
      const params = url.searchParams.get("params") || undefined;
      sendJson(res, 200, browseId ? await artistAlbums(browseId, params) : { title: null, cards: [] });
      return true;
    }
    if (route.startsWith("/album/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/album/".length));
      sendJson(res, 200, await album(id));
      return true;
    }
    if (route === "/album-browse-id" && method === "GET") {
      const olak = url.searchParams.get("audioPlaylistId") || "";
      sendJson(res, 200, { browseId: olak ? await albumBrowseId(olak) : null });
      return true;
    }
    if (route.startsWith("/song/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/song/".length));
      sendJson(res, 200, await song(id));
      return true;
    }
    if (route.startsWith("/user/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/user/".length));
      sendJson(res, 200, await user(id));
      return true;
    }
    if (route.startsWith("/channel/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/channel/".length));
      sendJson(res, 200, await channel(id));
      return true;
    }
    if (route.startsWith("/podcast/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/podcast/".length));
      sendJson(res, 200, await podcast(id));
      return true;
    }
    if (route.startsWith("/episode/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/episode/".length));
      sendJson(res, 200, await episode(id));
      return true;
    }
    if (route === "/episodes-playlist" && method === "GET") {
      const id = url.searchParams.get("playlistId") || "SE";
      sendJson(res, 200, await episodesPlaylist(id));
      return true;
    }
    if (route.startsWith("/next/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/next/".length));
      const pl = url.searchParams.get("playlistId") || undefined;
      sendJson(res, 200, await upNext(id, pl));
      return true;
    }
    if (route.startsWith("/radio/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/radio/".length));
      sendJson(res, 200, await radio(id));
      return true;
    }
    if (route === "/queue-more" && method === "GET") {
      const token = url.searchParams.get("token") || "";
      sendJson(res, 200, token ? await queueMore(token) : { tracks: [], continuation: null });
      return true;
    }
    if (route.startsWith("/similar/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/similar/".length));
      sendJson(res, 200, { tracks: await similar(id) });
      return true;
    }
    if (route.startsWith("/rating/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/rating/".length));
      sendJson(res, 200, { status: await rating(id) });
      return true;
    }
    if (route.startsWith("/related/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/related/".length));
      sendJson(res, 200, await related(id));
      return true;
    }
    if (route.startsWith("/lyrics/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/lyrics/".length));
      sendJson(res, 200, await lyrics(id));
      return true;
    }

    // ---- auth: login via controlled Chrome + CDP capture ----
    if (route === "/auth/status") {
      sendJson(res, 200, {
        authenticated: isAuthenticated(),
        login: getLoginState(),
      });
      return true;
    }
    if (route === "/auth/login" && method === "POST") {
      const state = startLogin();
      sendJson(res, 200, { ok: true, login: state });
      return true;
    }
    if (route === "/auth/logout" && method === "POST") {
      logout();
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (route === "/account" && method === "GET") {
      if (!isAuthenticated()) {
        sendJson(res, 401, { detail: "not authenticated" });
        return true;
      }
      sendJson(res, 200, await account());
      return true;
    }

    // ---- library + history (require a captured session) ----
    if (route.startsWith("/library/") || route === "/history") {
      if (!isAuthenticated()) {
        sendJson(res, 401, { detail: "not authenticated" });
        return true;
      }
      if (route === "/library/playlists") {
        sendJson(res, 200, { playlists: await libraryPlaylists() });
        return true;
      }
      if (route === "/library/liked") {
        sendJson(res, 200, { results: await likedSongs() });
        return true;
      }
      if (route === "/library/songs") {
        sendJson(res, 200, { results: await librarySongs() });
        return true;
      }
      if (route === "/library/albums") {
        sendJson(res, 200, { results: await libraryAlbums() });
        return true;
      }
      if (route === "/library/artists") {
        sendJson(res, 200, { results: await libraryArtists() });
        return true;
      }
      if (route === "/library/subscriptions") {
        sendJson(res, 200, { results: await librarySubscriptions() });
        return true;
      }
      if (route === "/library/podcasts") {
        sendJson(res, 200, { results: await libraryPodcasts() });
        return true;
      }
      if (route === "/library/uploads/songs") {
        sendJson(res, 200, { results: await libraryUploadSongs() });
        return true;
      }
      if (route === "/library/uploads/albums") {
        sendJson(res, 200, { results: await libraryUploadAlbums() });
        return true;
      }
      if (route === "/library/uploads/artists") {
        sendJson(res, 200, { results: await libraryUploadArtists() });
        return true;
      }
      if (route === "/history") {
        sendJson(res, 200, { sections: await history() });
        return true;
      }
      sendJson(res, 404, { detail: "not found" });
      return true;
    }

    // ---- mutations (POST; write to the real account — require a session) ----
    const MUTATIONS = new Set([
      "/rate",
      "/rate-playlist",
      "/feedback",
      "/subscribe",
      "/history/add",
      "/history/remove",
      "/taste-profile",
      "/upload",
      "/upload/delete",
      "/suggest/remove",
      "/playlist/create",
      "/playlist/delete",
      "/playlist/add",
      "/playlist/remove",
      "/playlist/move",
      "/playlist/rename",
    ]);
    if (MUTATIONS.has(route) && method === "POST") {
      if (!isAuthenticated()) {
        sendJson(res, 401, { detail: "not authenticated" });
        return true;
      }
      const b = await readBody(req);
      switch (route) {
        case "/rate":
          await rate(b.videoId, b.rating);
          break;
        case "/rate-playlist":
          await ratePlaylist(b.playlistId, b.rating);
          break;
        case "/feedback":
          await feedback(b.tokens ?? []);
          break;
        case "/history/add":
          await addHistoryItem(b.videoId);
          break;
        case "/history/remove":
          await removeHistoryItems(b.tokens ?? []);
          break;
        case "/taste-profile":
          await setTasteProfile(b.selections ?? []);
          break;
        case "/upload": {
          const ok = await uploadSong(b.filePath);
          sendJson(res, 200, { ok });
          return true;
        }
        case "/upload/delete":
          await deleteUploadEntity(b.entityId);
          break;
        case "/suggest/remove":
          await removeSearchSuggestions(b.tokens ?? []);
          break;
        case "/subscribe":
          await subscribe(b.channelId, !!b.subscribe);
          break;
        case "/playlist/create": {
          const playlistId = await createPlaylist(b.title, b.description, b.privacy);
          sendJson(res, 200, { ok: true, playlistId });
          return true;
        }
        case "/playlist/delete":
          await deletePlaylist(b.playlistId);
          break;
        case "/playlist/add":
          await addToPlaylist(b.playlistId, b.videoIds ?? []);
          break;
        case "/playlist/remove":
          await removeFromPlaylist(b.playlistId, b.items ?? []);
          break;
        case "/playlist/move":
          await movePlaylistItem(b.playlistId, b.setVideoId, b.successorSetVideoId);
          break;
        case "/playlist/rename":
          await renamePlaylist(b.playlistId, b.name);
          break;
      }
      sendJson(res, 200, { ok: true });
      return true;
    }

    sendJson(res, 404, { detail: "not found" });
    return true;
  } catch (e) {
    // A missing/cleared session surfaces as 401 (not a server error) so the
    // client can prompt sign-in instead of showing a generic 500.
    if (e instanceof NotAuthedError) {
      sendJson(res, 401, { detail: "not authenticated" });
    } else {
      sendJson(res, 500, { detail: String(e) });
    }
    return true;
  }
}

export function apiPlugin(): Plugin {
  return {
    name: "ytmusicnative-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handle(req, res).then((handled) => {
          if (!handled) next();
        });
      });
    },
    // Also serve the API in `vite preview` (production build preview).
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        handle(req, res).then((handled) => {
          if (!handled) next();
        });
      });
    },
  };
}
