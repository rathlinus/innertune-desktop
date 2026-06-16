import { useCallback, useEffect, useRef, useState } from "react";
import type { Chip, HomeCard, Playlist, Shelf, Track } from "./types";
import {
  createPlaylist,
  deletePlaylist,
  getAuthStatus,
  getCategory,
  getExplore,
  getHome,
  getPlaylists,
  getPlaylistTracks,
  getRadio,
  getRating,
  getSuggestions,
  logout,
  queueMore,
  rate,
  removeFromPlaylist,
  renamePlaylist,
} from "./api";
import { usePlayer } from "./usePlayer";
import { PlayerBar } from "./PlayerBar";
import { FullscreenPlayer } from "./FullscreenPlayer";
import { TrackList } from "./TrackList";
import { Home } from "./Home";
import { SearchResults } from "./SearchResults";
import { ArtistView } from "./ArtistView";
import { AlbumView } from "./AlbumView";
import { LibraryView } from "./LibraryView";
import { HistoryView } from "./HistoryView";
import { AddToPlaylistModal } from "./AddToPlaylistModal";
import { LoginModal } from "./LoginModal";
import {
  IconSearch,
  IconHome,
  IconExplore,
  IconLibrary,
  IconMenu,
  IconAdd,
  IconHistory,
  IconTrash,
} from "./icons";
import "./App.css";

const SEARCH_HISTORY_KEY = "ytm.search.history";
const LIKES_KEY = "ytm.likes.v1";

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

type View =
  | { kind: "home" }
  | { kind: "explore" }
  | { kind: "category"; title: string }
  | { kind: "search" }
  | { kind: "library" }
  | { kind: "list"; title: string; tracks: Track[]; playlistId?: string; editable?: boolean }
  | { kind: "artist"; browseId: string }
  | { kind: "album"; browseId: string }
  | { kind: "history" };

export default function App() {
  const player = usePlayer();
  // Endless autoplay: the radio continuation token for the current session, and
  // a guard so we only fetch one extension at a time.
  const radioTokenRef = useRef<string | null>(null);
  const extendingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState(""); // the submitted query
  const [searchHistory, setSearchHistory] = useState<string[]>(loadSearchHistory);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<View>({ kind: "home" });
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [exploreShelves, setExploreShelves] = useState<Shelf[]>([]);
  const [categoryShelves, setCategoryShelves] = useState<Shelf[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsMounted, setFsMounted] = useState(false);

  const [likes, setLikes] = useState<Set<string>>(() => loadSet(LIKES_KEY));
  const [dislikes, setDislikes] = useState<Set<string>>(new Set());
  const [addTarget, setAddTarget] = useState<string | null>(null); // videoId for add-to-playlist
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (fullscreen) setFsMounted(true);
  }, [fullscreen]);

  useEffect(() => {
    try {
      localStorage.setItem(LIKES_KEY, JSON.stringify([...likes]));
    } catch {
      /* best-effort */
    }
  }, [likes]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const s = await getAuthStatus();
      setAuthed(s.authenticated);
      return s.authenticated;
    } catch {
      return false;
    }
  }, []);

  // Sidebar playlist list. Loaded once signed in and refreshed after any
  // create/rename/delete so the sidebar stays in sync with the account.
  const refreshPlaylists = useCallback(async () => {
    try {
      setPlaylists(await getPlaylists());
    } catch {
      /* best-effort — the sidebar list just stays as-is */
    }
  }, []);

  useEffect(() => {
    if (authed) void refreshPlaylists();
    else setPlaylists([]);
  }, [authed, refreshPlaylists]);

  useEffect(() => {
    (async () => {
      const ok = await refreshAuth();
      try {
        setShelves(await getHome());
      } catch (e) {
        // The home feed needs an authenticated session. If we're logged out,
        // prompt sign-in rather than showing a raw 401/500 error banner.
        if (!ok) setShowLogin(true);
        else setError(String(e));
      }
    })();
  }, [refreshAuth]);

  // Live search suggestions (debounced) while typing.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    const id = window.setTimeout(() => {
      getSuggestions(q)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 160);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
    } catch {
      /* best-effort */
    }
  }, [searchHistory]);

  function goHome() {
    setError(null);
    setView({ kind: "home" });
  }

  // Explore feed: switch to the view immediately, then lazy-load its shelves
  // the first time (cached afterwards so re-opening is instant).
  async function openExplore() {
    setError(null);
    setView({ kind: "explore" });
    if (exploreShelves.length) return;
    try {
      setExploreShelves(await getExplore());
    } catch (e) {
      setError(String(e));
    }
  }

  // Open the feed behind an Explore chip (mood/genre category, "Neu", …).
  const openCategory = useCallback(
    async (browseId: string, params: string | null | undefined, title: string) => {
      setError(null);
      setCategoryShelves([]);
      setView({ kind: "category", title });
      try {
        setCategoryShelves(await getCategory(browseId, params));
      } catch (e) {
        setError(String(e));
      }
    },
    []
  );
  const onChip = useCallback(
    (c: Chip) => {
      if (c.browseId) void openCategory(c.browseId, c.params, c.text ?? "");
    },
    [openCategory]
  );

  function addToHistory(term: string) {
    setSearchHistory((h) =>
      [term, ...h.filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, 12)
    );
  }
  function removeFromHistory(term: string) {
    setSearchHistory((h) => h.filter((x) => x !== term));
  }

  function doSearch(term: string) {
    const q = term.trim();
    if (!q) return;
    setQuery(q);
    setSearchQuery(q);
    addToHistory(q);
    setSearchOpen(false);
    setError(null);
    setView({ kind: "search" });
  }
  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    doSearch(query);
  }

  // ---- playback ----
  const nowId = player.state.current?.videoId;

  // Play from a finite list (search/album/playlist): the list is the queue, and
  // radio is seeded automatically once it nears its end (watcher below).
  const playTrack = useCallback(
    (t: Track, queue: Track[]) => {
      radioTokenRef.current = null;
      player.play(t, queue);
    },
    [player]
  );

  // Play a single track and immediately fill the queue with its endless radio.
  const playRadio = useCallback(
    async (t: Track) => {
      radioTokenRef.current = null;
      player.play(t, [t]);
      try {
        const up = await getRadio(t.videoId);
        if (up.tracks.length) {
          // Append the radio tracks to the live queue rather than calling
          // player.play() again — re-playing the same track would reassign
          // audio.src and restart playback from 0. appendQueue dedupes `t`.
          player.appendQueue(up.tracks);
          radioTokenRef.current = up.continuation;
        }
      } catch {
        /* keep the single track */
      }
    },
    [player]
  );

  // Endless autoplay: when playback nears the end of the queue, page the radio
  // (or seed one from the current track if the queue was a finite list) and
  // append the new tracks — so music never just stops.
  const playIdx = player.state.index;
  const queueLen = player.state.queue.length;
  useEffect(() => {
    if (playIdx < 0 || queueLen === 0 || playIdx < queueLen - 3) return;
    if (extendingRef.current) return;
    const current = player.state.queue[playIdx];
    if (!current) return;
    extendingRef.current = true;
    (async () => {
      try {
        const more = radioTokenRef.current
          ? await queueMore(radioTokenRef.current)
          : await getRadio(current.videoId);
        radioTokenRef.current = more.continuation;
        player.appendQueue(more.tracks);
      } catch {
        /* ignore — will retry as playback advances */
      } finally {
        extendingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playIdx, queueLen]);

  // ---- navigation ----
  const openArtist = (browseId: string) => {
    setError(null);
    setView({ kind: "artist", browseId });
  };
  const openAlbum = (browseId: string) => {
    setError(null);
    setView({ kind: "album", browseId });
  };
  const openPlaylist = useCallback(
    async (id: string, title: string, editable = false) => {
      setError(null);
      setView({ kind: "list", title, tracks: [], playlistId: id, editable });
      try {
        const data = await getPlaylistTracks(id);
        setView({ kind: "list", title: data.title || title, tracks: data.results, playlistId: id, editable });
      } catch (err) {
        setError(String(err));
      }
    },
    []
  );
  function openLibrary() {
    if (!authed) {
      setShowLogin(true);
      return;
    }
    setError(null);
    setView({ kind: "library" });
  }
  function openHistory() {
    if (!authed) {
      setShowLogin(true);
      return;
    }
    setError(null);
    setView({ kind: "history" });
  }

  function onCard(card: HomeCard) {
    if (card.videoId) {
      void playRadio({
        videoId: card.videoId,
        title: card.title ?? "",
        artist: card.subtitle ?? "",
        album: null,
        duration: null,
        durationSeconds: null,
        thumbnail: card.thumbnail,
      });
    } else if (card.browseId?.startsWith("UC")) {
      openArtist(card.browseId);
    } else if (card.kind === "album" || card.browseId?.startsWith("MPRE")) {
      if (card.browseId) openAlbum(card.browseId);
    } else if (card.playlistId) {
      void openPlaylist(card.playlistId, card.title ?? "");
    } else if (card.browseId) {
      void openPlaylist(card.browseId, card.title ?? "");
    }
  }

  // ---- ratings ----
  const applyRate = useCallback(
    (videoId: string, rating: "LIKE" | "DISLIKE" | "INDIFFERENT") => {
      setLikes((prev) => {
        const n = new Set(prev);
        if (rating === "LIKE") n.add(videoId);
        else n.delete(videoId);
        return n;
      });
      setDislikes((prev) => {
        const n = new Set(prev);
        if (rating === "DISLIKE") n.add(videoId);
        else n.delete(videoId);
        return n;
      });
      rate(videoId, rating).catch((e) => showToast(`Bewertung fehlgeschlagen: ${e}`));
    },
    [showToast]
  );
  const toggleLike = useCallback(
    (t: Track) => applyRate(t.videoId, likes.has(t.videoId) ? "INDIFFERENT" : "LIKE"),
    [applyRate, likes]
  );
  const toggleDislike = useCallback(
    (t: Track) => applyRate(t.videoId, dislikes.has(t.videoId) ? "INDIFFERENT" : "DISLIKE"),
    [applyRate, dislikes]
  );

  // Mirror YouTube's real like state for the current song: fetch its rating when
  // the track changes so the player-bar thumb shows liked/disliked correctly
  // (optimistic clicks above are then confirmed/corrected by this).
  useEffect(() => {
    if (!nowId) return;
    let cancelled = false;
    getRating(nowId)
      .then((status) => {
        if (cancelled) return;
        setLikes((prev) => {
          const n = new Set(prev);
          if (status === "LIKE") n.add(nowId);
          else n.delete(nowId);
          return n;
        });
        setDislikes((prev) => {
          const n = new Set(prev);
          if (status === "DISLIKE") n.add(nowId);
          else n.delete(nowId);
          return n;
        });
      })
      .catch(() => {
        /* leave whatever optimistic/cached state we have */
      });
    return () => {
      cancelled = true;
    };
  }, [nowId]);

  // ---- playlist mutations (on the open list view) ----
  async function newPlaylist() {
    const name = window.prompt("Name der neuen Playlist:");
    if (!name?.trim()) return;
    try {
      const id = await createPlaylist(name.trim());
      showToast(`Playlist „${name.trim()}“ erstellt`);
      void refreshPlaylists();
      if (id) void openPlaylist(id, name.trim(), true);
    } catch (e) {
      showToast(`Fehler: ${e}`);
    }
  }
  async function renameCurrent() {
    if (view.kind !== "list" || !view.playlistId) return;
    const name = window.prompt("Playlist umbenennen:", view.title);
    if (!name?.trim() || name.trim() === view.title) return;
    try {
      await renamePlaylist(view.playlistId, name.trim());
      setView({ ...view, title: name.trim() });
      void refreshPlaylists();
      showToast("Umbenannt");
    } catch (e) {
      showToast(`Fehler: ${e}`);
    }
  }
  async function deleteCurrent() {
    if (view.kind !== "list" || !view.playlistId) return;
    if (!window.confirm(`Playlist „${view.title}“ löschen?`)) return;
    try {
      await deletePlaylist(view.playlistId);
      showToast("Playlist gelöscht");
      void refreshPlaylists();
      openLibrary();
    } catch (e) {
      showToast(`Fehler: ${e}`);
    }
  }
  async function removeTrack(t: Track) {
    if (view.kind !== "list" || !view.playlistId || !t.setVideoId) return;
    const prev = view.tracks;
    setView({ ...view, tracks: prev.filter((x) => x.setVideoId !== t.setVideoId) }); // optimistic
    try {
      await removeFromPlaylist(view.playlistId, [{ videoId: t.videoId, setVideoId: t.setVideoId }]);
      showToast("Aus Playlist entfernt");
    } catch (e) {
      setView({ ...view, tracks: prev }); // revert
      showToast(`Fehler: ${e}`);
    }
  }

  async function onLoginSuccess() {
    setShowLogin(false);
    const ok = await refreshAuth();
    if (ok) openLibrary();
  }
  async function onLogout() {
    await logout();
    await refreshAuth();
    goHome();
  }

  // search dropdown contents
  const qlc = query.trim().toLowerCase();
  const shownHistory = qlc
    ? searchHistory.filter((h) => h.toLowerCase().includes(qlc) && h.toLowerCase() !== qlc)
    : searchHistory;
  const shownSuggest = suggestions.filter((s) => s.toLowerCase() !== qlc).slice(0, 8);

  return (
    <div className={`app ${collapsed ? "collapsed" : ""}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-btn" onClick={() => setCollapsed((c) => !c)} title="Menü">
            <IconMenu size={24} />
          </button>
          <div className="brand" onClick={goHome}>
            <img className="brand-logo" src="/ytmusic_logo.svg" alt="YouTube Music" />
          </div>
        </div>

        <div className="search-wrap">
          <form className="searchbar" onSubmit={runSearch}>
            <IconSearch size={22} className="searchbar-icon" />
            <input
              placeholder="Nach Songs, Alben, Künstlern und Podcasts suchen"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setSearchOpen(false)}
            />
          </form>

          {searchOpen && (shownSuggest.length > 0 || shownHistory.length > 0) && (
            <div className="search-history" onMouseDown={(e) => e.preventDefault()}>
              {shownSuggest.map((sug) => (
                <div key={`s-${sug}`} className="search-history-item" onClick={() => doSearch(sug)}>
                  <IconSearch size={20} className="sh-icon" />
                  <span className="sh-text">{sug}</span>
                </div>
              ))}
              {shownHistory.map((h) => (
                <div key={`h-${h}`} className="search-history-item" onClick={() => doSearch(h)}>
                  <IconHistory size={20} className="sh-icon" />
                  <span className="sh-text">{h}</span>
                  <button
                    className="sh-del"
                    title="Entfernen"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromHistory(h);
                    }}
                  >
                    <IconTrash size={20} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="topbar-right">
          <button
            className="avatar"
            title={authed ? "Abmelden" : "Anmelden"}
            onClick={authed ? onLogout : () => setShowLogin(true)}
          >
            M
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <button className={`nav-item ${view.kind === "home" ? "active" : ""}`} onClick={goHome}>
          <IconHome size={24} active={view.kind === "home"} />
          <span className="nav-label">Startseite</span>
        </button>
        <button
          className={`nav-item ${view.kind === "explore" ? "active" : ""}`}
          onClick={openExplore}
        >
          <IconExplore size={24} active={view.kind === "explore"} />
          <span className="nav-label">Entdecken</span>
        </button>
        <button
          className={`nav-item ${view.kind === "library" || view.kind === "list" ? "active" : ""}`}
          onClick={openLibrary}
        >
          <IconLibrary size={24} active={view.kind === "library" || view.kind === "list"} />
          <span className="nav-label">Mediathek</span>
        </button>
        <button
          className={`nav-item ${view.kind === "history" ? "active" : ""}`}
          onClick={openHistory}
        >
          <IconHistory size={24} />
          <span className="nav-label">Verlauf</span>
        </button>

        <button className="new-playlist" onClick={newPlaylist}>
          <IconAdd size={22} />
          <span className="nav-label">Neue Playlist</span>
        </button>
        {playlists.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-list">
              {playlists.map((p) => (
                <button
                  key={p.playlistId}
                  className="lib-item"
                  title={p.title}
                  onClick={() => void openPlaylist(p.playlistId, p.title, true)}
                >
                  <span className="lib-title">{p.title}</span>
                  <span className="lib-sub">{p.count ? `${p.count} Songs` : "Playlist"}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      <main className="main">
        {error && <div className="status error">{error}</div>}

        {view.kind === "home" &&
          (shelves.length === 0 && !error ? (
            <div className="status">Wird geladen …</div>
          ) : (
            <Home shelves={shelves} nowId={nowId} onCard={onCard} onChip={onChip} />
          ))}

        {view.kind === "explore" &&
          (exploreShelves.length === 0 && !error ? (
            <div className="status">Wird geladen …</div>
          ) : (
            <Home shelves={exploreShelves} nowId={nowId} onCard={onCard} onChip={onChip} />
          ))}

        {view.kind === "category" && (
          <>
            <h1 className="page-title">{view.title}</h1>
            {categoryShelves.length === 0 && !error ? (
              <div className="status">Wird geladen …</div>
            ) : (
              <Home shelves={categoryShelves} nowId={nowId} onCard={onCard} onChip={onChip} />
            )}
          </>
        )}

        {view.kind === "search" && (
          <SearchResults
            query={searchQuery}
            nowId={nowId}
            onPlay={playTrack}
            onOpenArtist={openArtist}
            onOpenAlbum={openAlbum}
            onOpenPlaylist={(id, title) => void openPlaylist(id, title)}
            onAdd={(t) => setAddTarget(t.videoId)}
          />
        )}

        {view.kind === "artist" && (
          <ArtistView
            browseId={view.browseId}
            nowId={nowId}
            onPlay={playTrack}
            onCard={onCard}
            onAdd={(t) => setAddTarget(t.videoId)}
          />
        )}

        {view.kind === "album" && (
          <AlbumView
            browseId={view.browseId}
            nowId={nowId}
            onPlay={playTrack}
            onAdd={(t) => setAddTarget(t.videoId)}
          />
        )}

        {view.kind === "library" && (
          <LibraryView
            nowId={nowId}
            onPlay={playTrack}
            onOpenPlaylist={(id, title) => void openPlaylist(id, title, true)}
            onOpenAlbum={openAlbum}
            onOpenArtist={openArtist}
            onAdd={(t) => setAddTarget(t.videoId)}
            onLike={toggleLike}
            likes={likes}
          />
        )}

        {view.kind === "history" && (
          <HistoryView
            nowId={nowId}
            onPlay={playTrack}
            onAdd={(t) => setAddTarget(t.videoId)}
            onLike={toggleLike}
            likes={likes}
          />
        )}

        {view.kind === "list" && (
          <>
            <div className="list-head">
              <h1 className="page-title">{view.title}</h1>
              {view.editable && view.playlistId && (
                <div className="list-actions">
                  <button className="btn-outline" onClick={renameCurrent}>
                    Umbenennen
                  </button>
                  <button className="btn-outline" onClick={deleteCurrent}>
                    Löschen
                  </button>
                </div>
              )}
            </div>
            {view.tracks.length === 0 ? (
              <div className="status">Wird geladen …</div>
            ) : (
              <TrackList
                tracks={view.tracks}
                nowId={nowId}
                onPlay={playTrack}
                onAdd={(t) => setAddTarget(t.videoId)}
                onLike={toggleLike}
                likes={likes}
                onRemove={view.editable ? removeTrack : undefined}
              />
            )}
          </>
        )}
      </main>

      <PlayerBar
        state={player.state}
        onToggle={player.toggle}
        onNext={player.next}
        onPrev={player.prev}
        onSeek={player.seek}
        getCurrentTime={player.getCurrentTime}
        onVolume={player.setVolume}
        onShuffle={player.toggleShuffle}
        onRepeat={player.cycleRepeat}
        onExpand={() => setFullscreen((f) => !f)}
        liked={!!nowId && likes.has(nowId)}
        disliked={!!nowId && dislikes.has(nowId)}
        onLike={() => player.state.current && toggleLike(player.state.current)}
        onDislike={() => player.state.current && toggleDislike(player.state.current)}
      />

      {fsMounted && (
        <FullscreenPlayer
          open={fullscreen}
          onClosed={() => setFsMounted(false)}
          state={player.state}
          onClose={() => setFullscreen(false)}
          onToggle={player.toggle}
          onPlayAt={player.playAt}
          onPlay={playTrack}
        />
      )}

      {addTarget && (
        <AddToPlaylistModal
          videoId={addTarget}
          onClose={() => setAddTarget(null)}
          onDone={showToast}
        />
      )}

      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} onSuccess={onLoginSuccess} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
