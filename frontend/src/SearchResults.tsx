import { useEffect, useState } from "react";
import type { HomeCard, SearchResult, Track } from "./types";
import { searchItems } from "./api";
import { TrackList } from "./TrackList";
import { IconMore } from "./icons";

const FILTERS = [
  { key: "songs", label: "Songs" },
  { key: "videos", label: "Videos" },
  { key: "albums", label: "Alben" },
  { key: "artists", label: "Künstler" },
  { key: "playlists", label: "Playlists" },
];

interface Props {
  query: string;
  nowId?: string;
  onPlay: (t: Track, queue: Track[]) => void;
  onOpenArtist: (browseId: string) => void;
  onOpenAlbum: (browseId: string) => void;
  onOpenPlaylist: (playlistId: string, title: string) => void;
  onAdd: (t: Track) => void;
  onMenu: (t: Track, e: React.MouseEvent) => void;
  onCardMenu: (card: HomeCard, e: React.MouseEvent) => void;
}

// Map a non-song search result to the HomeCard shape the card menu expects.
const toCard = (i: SearchResult): HomeCard => ({
  kind: i.kind === "album" ? "album" : "playlist",
  videoId: i.videoId,
  playlistId: i.playlistId,
  browseId: i.browseId,
  title: i.title ?? "",
  subtitle: i.subtitle,
  thumbnail: i.thumbnail,
  aspect: "square",
  explicit: i.explicit,
});

const toTrack = (r: SearchResult): Track => ({
  videoId: r.videoId ?? "",
  title: r.title ?? "",
  artist: r.subtitle ?? "",
  album: null,
  duration: r.duration,
  durationSeconds: null,
  thumbnail: r.thumbnail,
  channelId: r.channelId,
  albumBrowseId: r.albumBrowseId,
  libraryAddToken: r.libraryAddToken,
  libraryRemoveToken: r.libraryRemoveToken,
  inLibrary: r.inLibrary,
});

export function SearchResults({
  query,
  nowId,
  onPlay,
  onOpenArtist,
  onOpenAlbum,
  onOpenPlaylist,
  onAdd,
  onMenu,
  onCardMenu,
}: Props) {
  const [filter, setFilter] = useState("songs");
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset to the Songs chip whenever the query changes.
  useEffect(() => setFilter("songs"), [query]);

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    setErr(null);
    searchItems(query, filter)
      .then(setItems)
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [query, filter]);

  const playable = filter === "songs" || filter === "videos";
  const songs = items.filter((i) => i.kind === "song" && i.videoId).map(toTrack);
  const cards = items.filter((i) => i.kind !== "song");

  return (
    <div className="search-results">
      <div className="filter-chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? "chip-on" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div className="status">Suche läuft …</div>}
      {err && <div className="status error">{err}</div>}

      {!loading && !err && playable && (
        <TrackList tracks={songs} nowId={nowId} onPlay={(t) => onPlay(t, songs)} onAdd={onAdd} onMenu={onMenu} />
      )}

      {!loading && !err && !playable && (
        <div className="card-grid">
          {cards.map((i, idx) => (
            <div
              key={(i.browseId ?? "") + idx}
              className="lib-card"
              onClick={() => {
                if (i.kind === "artist") onOpenArtist(i.browseId!);
                else if (i.kind === "album") onOpenAlbum(i.browseId!);
                else if (i.kind === "playlist")
                  onOpenPlaylist(i.playlistId ?? i.browseId!, i.title ?? "");
              }}
              onContextMenu={(e) => { e.preventDefault(); onCardMenu(toCard(i), e); }}
            >
              <div className="lib-card-art-wrap">
                {i.thumbnail ? (
                  <img
                    className={`lib-card-art ${i.kind === "artist" ? "lib-card-art-round" : ""}`}
                    src={i.thumbnail}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <div className="lib-card-art lib-card-art-empty" />
                )}
                <button
                  className="card-more lib-card-more"
                  title="Mehr"
                  onClick={(e) => { e.stopPropagation(); onCardMenu(toCard(i), e); }}
                >
                  <IconMore size={20} />
                </button>
              </div>
              <div className="card-title">
                {i.explicit && <span className="explicit">E</span>}
                {i.title}
              </div>
              {i.subtitle && <div className="card-sub">{i.subtitle}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
