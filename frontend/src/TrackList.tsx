import type { Track } from "./types";
import { IconPlay, IconThumbUp, IconAdd, IconTrash } from "./icons";

interface Props {
  tracks: Track[];
  nowId?: string;
  onPlay: (t: Track, queue: Track[]) => void;
  // Optional row actions (shown on hover when provided).
  onLike?: (t: Track) => void;
  likes?: Set<string>;
  onAdd?: (t: Track) => void; // add to a playlist
  onRemove?: (t: Track) => void; // remove from the current (editable) playlist
}

export function TrackList({ tracks, nowId, onPlay, onLike, likes, onAdd, onRemove }: Props) {
  const hasActions = !!(onLike || onAdd || onRemove);
  return (
    <div className={`results ${hasActions ? "results-actions" : ""}`}>
      {tracks.map((t, i) => {
        const active = t.videoId === nowId;
        const liked = !!likes?.has(t.videoId);
        return (
          <div
            key={t.videoId + i}
            className={`row ${active ? "row-active" : ""}`}
            onDoubleClick={() => onPlay(t, tracks)}
          >
            <div className="row-art-wrap">
              {t.thumbnail && <img className="row-art" src={t.thumbnail} alt="" loading="lazy" />}
              <button className="row-play" onClick={() => onPlay(t, tracks)} title="Play">
                <IconPlay size={20} />
              </button>
            </div>
            <div className="row-info">
              <div className="row-title">{t.title}</div>
              <div className="row-artist">{t.artist}</div>
            </div>
            <div className="row-album">{t.album}</div>
            {hasActions && (
              <div className="row-actions">
                {onLike && (
                  <button
                    className={`row-act ${liked ? "row-act-on" : ""}`}
                    onClick={() => onLike(t)}
                    title="Mag ich"
                  >
                    <IconThumbUp size={18} />
                  </button>
                )}
                {onAdd && (
                  <button className="row-act" onClick={() => onAdd(t)} title="Zu Playlist hinzufügen">
                    <IconAdd size={18} />
                  </button>
                )}
                {onRemove && (
                  <button className="row-act" onClick={() => onRemove(t)} title="Aus Playlist entfernen">
                    <IconTrash size={18} />
                  </button>
                )}
              </div>
            )}
            <div className="row-dur">{t.duration}</div>
          </div>
        );
      })}
    </div>
  );
}
