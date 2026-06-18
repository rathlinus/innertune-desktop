import { useState } from "react";
import type { Track } from "./types";
import type { MenuCtx } from "./TrackMenu";
import { IconQueueClose, IconMore, IconRemoveCircle } from "./icons";

// "Wiedergabeliste" — the up-next side panel. Shows the live player queue, lets
// you jump to a track, remove one, reorder by dragging, or open its context
// menu. Closing it just hides the panel (the queue itself keeps playing).
interface Props {
  queue: Track[];
  index: number;
  onClose: () => void;
  onPlayAt: (i: number) => void;
  onRemove: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onMenu: (ctx: MenuCtx) => void;
}

export function QueuePanel({ queue, index, onClose, onPlayAt, onRemove, onMove, onMenu }: Props) {
  // The row currently being dragged and the row it's hovering over, so we can
  // dim the source and draw a drop indicator. Both reset on drop/cancel.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <aside className="queue-panel">
      <div className="queue-head">
        <h2>Wiedergabeliste</h2>
        <button className="icon-btn" onClick={onClose} title="Wiedergabeliste schließen">
          <IconQueueClose size={22} />
        </button>
      </div>
      <div className="queue-list">
        {queue.length === 0 && <div className="status">Keine Titel in der Wiedergabeliste</div>}
        {queue.map((t, i) => {
          const classes = ["queue-row"];
          if (i === index) classes.push("queue-row-active");
          if (i === dragIndex) classes.push("queue-row-dragging");
          if (overIndex === i && dragIndex !== null && dragIndex !== i)
            classes.push(i > dragIndex ? "queue-row-drop-after" : "queue-row-drop-before");
          return (
            <div
              key={t.videoId + i}
              className={classes.join(" ")}
              draggable
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
                // Firefox needs data set for the drag to start at all.
                e.dataTransfer.setData("text/plain", String(i));
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overIndex !== i) setOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== i) onMove(dragIndex, i);
                endDrag();
              }}
              onDragEnd={endDrag}
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
                <IconRemoveCircle size={18} />
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
          );
        })}
      </div>
    </aside>
  );
}
