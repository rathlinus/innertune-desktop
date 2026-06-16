// Vite plugin: serves the whole backend API as middleware on the SAME dev
// server as the React app, so `npm run dev` starts everything (and there's no
// CORS since it's same-origin).

import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  home,
  explore,
  category,
  search,
  searchItems,
  searchSuggestions,
  playlist,
  libraryPlaylists,
  librarySongs,
  libraryAlbums,
  libraryArtists,
  likedSongs,
  lyrics,
  artist,
  album,
  upNext,
  radio,
  queueMore,
  similar,
  rating,
  related,
  history,
  rate,
  subscribe,
  createPlaylist,
  deletePlaylist,
  addToPlaylist,
  removeFromPlaylist,
  renamePlaylist,
} from "./ytm";
import { streamAudio } from "./stream";
import { NotAuthedError } from "./innertube";
import {
  startLogin,
  isAuthenticated,
  getLoginState,
  logout,
} from "./chrome";

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

async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || "", "http://localhost");
  const p = url.pathname;
  if (!p.startsWith("/api/")) return false;

  const route = p.slice(4); // strip "/api"
  const method = req.method || "GET";

  try {
    // ---- streaming ----
    if (route.startsWith("/stream/")) {
      await streamAudio(decodeURIComponent(route.slice("/stream/".length)), req, res);
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
      sendJson(res, 200, {
        suggestions: await searchSuggestions(url.searchParams.get("q") || ""),
      });
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
    if (route.startsWith("/album/") && method === "GET") {
      const id = decodeURIComponent(route.slice("/album/".length));
      sendJson(res, 200, await album(id));
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
      "/subscribe",
      "/playlist/create",
      "/playlist/delete",
      "/playlist/add",
      "/playlist/remove",
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
