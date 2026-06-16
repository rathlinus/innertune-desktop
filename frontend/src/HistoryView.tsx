import { useEffect, useState } from "react";
import type { HistorySection, Track } from "./types";
import { getHistory } from "./api";
import { TrackList } from "./TrackList";

interface Props {
  nowId?: string;
  onPlay: (t: Track, queue: Track[]) => void;
  onAdd: (t: Track) => void;
  onLike: (t: Track) => void;
  likes: Set<string>;
  onMenu: (t: Track, e: React.MouseEvent) => void;
}

export function HistoryView({ nowId, onPlay, onAdd, onLike, likes, onMenu }: Props) {
  const [sections, setSections] = useState<HistorySection[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getHistory()
      .then(setSections)
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="status error">{err}</div>;
  if (!sections) return <div className="status">Wird geladen …</div>;

  return (
    <div className="history">
      <h1 className="page-title">Verlauf</h1>
      {sections.map((s) => (
        <section key={s.title} className="history-section">
          <h2 className="section-title">{s.title}</h2>
          <TrackList
            tracks={s.tracks}
            nowId={nowId}
            onPlay={onPlay}
            onAdd={onAdd}
            onLike={onLike}
            likes={likes}
            onMenu={onMenu}
          />
        </section>
      ))}
    </div>
  );
}
