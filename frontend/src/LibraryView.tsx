import { useEffect, useState } from "react";
import type { ArtistCard, HomeCard, Playlist, Track } from "./types";
import {
  getLibraryAlbums,
  getLibraryArtists,
  getLibraryPodcasts,
  getLibrarySongs,
  getLibrarySubscriptions,
  getLibraryUploadSongs,
  getPlaylists,
} from "./api";
import { TrackList } from "./TrackList";
import { IconMore } from "./icons";

const playlistCard = (p: Playlist): HomeCard => ({
  kind: "playlist",
  playlistId: p.playlistId,
  browseId: p.playlistId,
  title: p.title,
  subtitle: typeof p.count === "number" ? `${p.count} Songs` : (p.count ?? null),
  thumbnail: p.thumbnail,
  aspect: "square",
  explicit: false,
});
const artistCard = (a: ArtistCard): HomeCard => ({
  kind: "playlist",
  browseId: a.browseId,
  title: a.name ?? "",
  subtitle: a.subtitle,
  thumbnail: a.thumbnail,
  aspect: "square",
  explicit: false,
});

type Tab = "playlists" | "songs" | "albums" | "artists" | "subscriptions" | "uploads" | "podcasts";
const TABS: { key: Tab; label: string }[] = [
  { key: "playlists", label: "Playlists" },
  { key: "songs", label: "Songs" },
  { key: "albums", label: "Alben" },
  { key: "artists", label: "Künstler" },
  { key: "subscriptions", label: "Abos" },
  { key: "uploads", label: "Uploads" },
  { key: "podcasts", label: "Podcasts" },
];

interface Props {
  nowId?: string;
  onPlay: (t: Track, queue: Track[]) => void;
  onOpenPlaylist: (playlistId: string, title: string) => void;
  onOpenAlbum: (browseId: string) => void;
  onOpenArtist: (browseId: string) => void;
  onAdd: (t: Track) => void;
  onLike: (t: Track) => void;
  likes: Set<string>;
  onMenu: (t: Track, e: React.MouseEvent) => void;
  onCardMenu: (card: HomeCard, e: React.MouseEvent) => void;
}

export function LibraryView(props: Props) {
  const { nowId, onPlay, onOpenPlaylist, onOpenAlbum, onOpenArtist, onAdd, onLike, likes, onMenu, onCardMenu } = props;
  const [tab, setTab] = useState<Tab>("playlists");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [songs, setSongs] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<HomeCard[]>([]);
  const [artists, setArtists] = useState<ArtistCard[]>([]);
  const [subscriptions, setSubscriptions] = useState<ArtistCard[]>([]);
  const [uploads, setUploads] = useState<Track[]>([]);
  const [podcasts, setPodcasts] = useState<HomeCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    setLoading(true);
    const job =
      tab === "playlists"
        ? getPlaylists().then(setPlaylists)
        : tab === "songs"
        ? getLibrarySongs().then(setSongs)
        : tab === "albums"
        ? getLibraryAlbums().then(setAlbums)
        : tab === "artists"
        ? getLibraryArtists().then(setArtists)
        : tab === "subscriptions"
        ? getLibrarySubscriptions().then(setSubscriptions)
        : tab === "uploads"
        ? getLibraryUploadSongs().then(setUploads)
        : getLibraryPodcasts().then(setPodcasts);
    job.catch((e) => setErr(String(e))).finally(() => setLoading(false));
  }, [tab]);

  return (
    <div className="library">
      <h1 className="page-title">Mediathek</h1>
      <div className="filter-chips">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`chip ${tab === t.key ? "chip-on" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="status">Wird geladen …</div>}
      {err && <div className="status error">{err}</div>}

      {!loading && !err && tab === "playlists" && (
        <div className="card-grid">
          {playlists.map((p) => (
            <div
              key={p.playlistId}
              className="lib-card"
              onClick={() => onOpenPlaylist(p.playlistId, p.title)}
              onContextMenu={(e) => { e.preventDefault(); onCardMenu(playlistCard(p), e); }}
            >
              <div className="lib-card-art-wrap">
                {p.thumbnail ? (
                  <img className="lib-card-art" src={p.thumbnail} alt="" loading="lazy" />
                ) : (
                  <div className="lib-card-art lib-card-art-empty" />
                )}
                <button className="card-more lib-card-more" title="Mehr"
                  onClick={(e) => { e.stopPropagation(); onCardMenu(playlistCard(p), e); }}>
                  <IconMore size={20} />
                </button>
              </div>
              <div className="card-title">{p.title}</div>
              <div className="card-sub">{p.count ? `${p.count} Songs` : "Playlist"}</div>
            </div>
          ))}
        </div>
      )}

      {!loading && !err && tab === "songs" && (
        <TrackList tracks={songs} nowId={nowId} onPlay={onPlay} onAdd={onAdd} onLike={onLike} likes={likes} onMenu={onMenu} />
      )}

      {!loading && !err && tab === "albums" && (
        <div className="card-grid">
          {albums.length === 0 && <div className="status muted">Keine gespeicherten Alben.</div>}
          {albums.map((a, i) => (
            <div
              key={(a.browseId ?? "") + i}
              className="lib-card"
              onClick={() => a.browseId && onOpenAlbum(a.browseId)}
              onContextMenu={(e) => { e.preventDefault(); onCardMenu(a, e); }}
            >
              <div className="lib-card-art-wrap">
                {a.thumbnail ? (
                  <img className="lib-card-art" src={a.thumbnail} alt="" loading="lazy" />
                ) : (
                  <div className="lib-card-art lib-card-art-empty" />
                )}
                <button className="card-more lib-card-more" title="Mehr"
                  onClick={(e) => { e.stopPropagation(); onCardMenu(a, e); }}>
                  <IconMore size={20} />
                </button>
              </div>
              <div className="card-title">{a.title}</div>
              {a.subtitle && <div className="card-sub">{a.subtitle}</div>}
            </div>
          ))}
        </div>
      )}

      {!loading && !err && (tab === "artists" || tab === "subscriptions") && (
        <div className="card-grid">
          {(tab === "artists" ? artists : subscriptions).length === 0 && (
            <div className="status muted">
              {tab === "artists" ? "Keine Künstler in der Mediathek." : "Keine abonnierten Künstler."}
            </div>
          )}
          {(tab === "artists" ? artists : subscriptions).map((a) => (
            <div key={a.browseId} className="lib-card" onClick={() => onOpenArtist(a.browseId)}
              onContextMenu={(e) => { e.preventDefault(); onCardMenu(artistCard(a), e); }}>
              <div className="lib-card-art-wrap">
                {a.thumbnail ? (
                  <img className="lib-card-art lib-card-art-round" src={a.thumbnail} alt="" loading="lazy" />
                ) : (
                  <div className="lib-card-art lib-card-art-round lib-card-art-empty" />
                )}
                <button className="card-more lib-card-more" title="Mehr"
                  onClick={(e) => { e.stopPropagation(); onCardMenu(artistCard(a), e); }}>
                  <IconMore size={20} />
                </button>
              </div>
              <div className="card-title">{a.name}</div>
              {a.subtitle && <div className="card-sub">{a.subtitle}</div>}
            </div>
          ))}
        </div>
      )}

      {!loading && !err && tab === "uploads" && (
        uploads.length === 0 ? (
          <div className="status muted">Keine hochgeladenen Titel.</div>
        ) : (
          <TrackList tracks={uploads} nowId={nowId} onPlay={onPlay} onAdd={onAdd} onLike={onLike} likes={likes} onMenu={onMenu} />
        )
      )}

      {!loading && !err && tab === "podcasts" && (
        <div className="card-grid">
          {podcasts.length === 0 && <div className="status muted">Keine Podcasts.</div>}
          {podcasts.map((p, i) => {
            const id = p.playlistId ?? p.browseId;
            return (
              <div
                key={(p.browseId ?? p.playlistId ?? "") + i}
                className="lib-card"
                onClick={() => id && onOpenPlaylist(id, p.title ?? "")}
                onContextMenu={(e) => { e.preventDefault(); onCardMenu(p, e); }}
              >
                <div className="lib-card-art-wrap">
                  {p.thumbnail ? (
                    <img className="lib-card-art" src={p.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <div className="lib-card-art lib-card-art-empty" />
                  )}
                </div>
                <div className="card-title">{p.title}</div>
                {p.subtitle && <div className="card-sub">{p.subtitle}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
