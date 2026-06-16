import { useEffect, useState } from "react";
import type { AlbumPage, Track } from "./types";
import { getAlbum } from "./api";
import { TrackList } from "./TrackList";
import { IconPlay } from "./icons";

interface Props {
  browseId: string;
  nowId?: string;
  onPlay: (t: Track, queue: Track[]) => void;
  onAdd?: (t: Track) => void;
  onMenu?: (t: Track, e: React.MouseEvent) => void;
}

export function AlbumView({ browseId, nowId, onPlay, onAdd, onMenu }: Props) {
  const [data, setData] = useState<AlbumPage | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    getAlbum(browseId)
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, [browseId]);

  if (err) return <div className="status error">{err}</div>;
  if (!data) return <div className="status">Wird geladen …</div>;

  return (
    <div className="detail">
      <header className="detail-hero">
        {data.thumbnail && <img className="detail-hero-art" src={data.thumbnail} alt="" />}
        <div className="detail-hero-info">
          {data.subtitle && <div className="detail-eyebrow">{data.subtitle}</div>}
          <h1 className="detail-title">{data.title}</h1>
          <div className="detail-meta">
            {[data.artist, data.secondSubtitle].filter(Boolean).join(" • ")}
          </div>
          <div className="hero-actions">
            {data.tracks.length > 0 && (
              <button className="btn-primary" onClick={() => onPlay(data.tracks[0], data.tracks)}>
                <IconPlay size={20} /> Abspielen
              </button>
            )}
          </div>
        </div>
      </header>

      <TrackList tracks={data.tracks} nowId={nowId} onPlay={onPlay} onAdd={onAdd} onMenu={onMenu} />
    </div>
  );
}
