import type { Track } from "./types";
import type { MenuCtx } from "./TrackMenu";
import { IconClose, IconMore, IconTrash } from "./icons";

// "Wiedergabeliste" — the up-next side panel. Shows the live player queue, lets
// you jump to a track, remove one, or open its context menu. Closing it just
// hides the panel (the queue itself keeps playing).
interface Props {
  queue: Track[];
  index: number;
  onClose: () => void;
  onPlayAt: (i: number) => void;
  onRemove: (i: number) => void;
  onMenu: (ctx: MenuCtx) => void;
}

export function QueuePanel({ queue, index, onClose, onPlayAt, onRemove, onMenu }: Props) {
  return (
    <aside className="queue-panel">
      <div className="queue-head">
        <h2>Wiedergabeliste</h2>
        <button className="icon-btn" onClick={onClose} title="Wiedergabeliste schließen">
          <IconClose size={22} />
        </button>
      </div>
      <div className="queue-list">
        {queue.length === 0 && <div className="status">Keine Titel in der Wiedergabeliste</div>}
        {queue.map((t, i) => (
          <div
            key={t.videoId + i}
            className={`queue-row ${i === index ? "queue-row-active" : ""}`}
            onDoubleClick={() => onPlayAt(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              onMenu({ track: t, x: e.clientX, y: e.clientY, queueIndex: i });
            }}
          >
            {t.thumbnail && <img className="queue-art" src={t.thumbnail} alt="" loading="lazy" />}
            <div className="queue-info" onClick={() => onPlayAt(i)}>
              <div className="queue-title">{t.title}</div>
              <div className="queue-artist">{t.artist}</div>
            </div>
            <button className="row-act queue-remove" title="Entfernen" onClick={() => onRemove(i)}>
              <IconTrash size={18} />
            </button>
            <button
              className="row-act"
              title="Mehr"
              onClick={(e) =>
                onMenu({ track: t, x: e.clientX, y: e.clientY, queueIndex: i })
              }
            >
              <IconMore size={18} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
