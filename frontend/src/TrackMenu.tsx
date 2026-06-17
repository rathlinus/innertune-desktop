import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Track } from "./types";
import {
  IconRadio,
  IconPlayNext,
  IconQueue,
  IconLibraryAdd,
  IconLibraryAdded,
  IconThumbUp,
  IconDownload,
  IconPlaylistAdd,
  IconRemoveCircle,
  IconArtist,
  IconAlbum,
  IconShare,
  IconStats,
} from "./icons";

// Where the menu was opened (right-click point or the ⋮ button), plus the
// queue index when it was opened from the queue panel (enables "remove from
// queue"). The whole right-click menu from the real YT Music is driven from here.
export interface MenuCtx {
  track: Track;
  x: number;
  y: number;
  queueIndex?: number;
}

interface Props {
  ctx: MenuCtx;
  inLibrary: boolean;
  liked: boolean;
  onClose: () => void;
  onRadio: (t: Track) => void;
  onPlayNext: (t: Track) => void;
  onEnqueue: (t: Track) => void;
  onToggleLibrary: (t: Track) => void;
  onLike: (t: Track) => void;
  onAddToPlaylist: (t: Track) => void;
  onRemoveFromQueue?: (index: number) => void;
  onOpenArtist?: (channelId: string) => void;
  onOpenAlbum?: (browseId: string) => void;
  onShare: (t: Track) => void;
  onDownload: (t: Track) => void;
  onStats: (t: Track) => void;
}

export function TrackMenu(p: Props) {
  const { ctx } = p;
  const { track } = ctx;
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: ctx.x, y: ctx.y });

  // Clamp the menu inside the viewport once we can measure it.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    const x = Math.min(ctx.x, window.innerWidth - width - pad);
    const y = Math.min(ctx.y, window.innerHeight - height - pad);
    setPos({ x: Math.max(pad, x), y: Math.max(pad, y) });
  }, [ctx.x, ctx.y]);

  // Close on outside click, scroll, or Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) p.onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", p.onClose);
    document.addEventListener("scroll", p.onClose, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", p.onClose);
      document.removeEventListener("scroll", p.onClose, true);
    };
  }, [p]);

  // Run an action then close.
  const run = (fn: () => void) => () => {
    fn();
    p.onClose();
  };

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button className="ctx-item" onClick={run(() => p.onRadio(track))}>
        <IconRadio size={20} /> <span>Radio starten</span>
      </button>
      <button className="ctx-item" onClick={run(() => p.onPlayNext(track))}>
        <IconPlayNext size={20} /> <span>Als Nächstes abspielen</span>
      </button>
      <button className="ctx-item" onClick={run(() => p.onEnqueue(track))}>
        <IconQueue size={20} /> <span>In die Wiedergabeliste</span>
      </button>

      {(track.libraryAddToken || track.libraryRemoveToken) && (
        <button className="ctx-item" onClick={run(() => p.onToggleLibrary(track))}>
          {p.inLibrary ? <IconLibraryAdded size={20} /> : <IconLibraryAdd size={20} />}
          <span>{p.inLibrary ? "Aus Mediathek entfernen" : "In Mediathek speichern"}</span>
        </button>
      )}

      <button
        className={`ctx-item ${p.liked ? "ctx-on" : ""}`}
        onClick={run(() => p.onLike(track))}
      >
        <IconThumbUp size={20} active={p.liked} />
        <span>
          {p.liked ? "Aus „Titel, die ich mag“ entfernen" : "Zu „Titel, die ich mag“ hinzufügen"}
        </span>
      </button>

      <button className="ctx-item" onClick={run(() => p.onDownload(track))}>
        <IconDownload size={20} /> <span>Herunterladen</span>
      </button>
      <button className="ctx-item" onClick={run(() => p.onAddToPlaylist(track))}>
        <IconPlaylistAdd size={20} /> <span>Zu Playlist hinzufügen</span>
      </button>

      {ctx.queueIndex != null && p.onRemoveFromQueue && (
        <button className="ctx-item" onClick={run(() => p.onRemoveFromQueue!(ctx.queueIndex!))}>
          <IconRemoveCircle size={20} /> <span>Aus Wiedergabeliste entfernen</span>
        </button>
      )}

      {track.albumBrowseId && p.onOpenAlbum && (
        <button className="ctx-item" onClick={run(() => p.onOpenAlbum!(track.albumBrowseId!))}>
          <IconAlbum size={20} /> <span>Album anzeigen</span>
        </button>
      )}
      {track.channelId && p.onOpenArtist && (
        <button className="ctx-item" onClick={run(() => p.onOpenArtist!(track.channelId!))}>
          <IconArtist size={20} /> <span>Künstlerseite anzeigen</span>
        </button>
      )}

      <button className="ctx-item" onClick={run(() => p.onShare(track))}>
        <IconShare size={20} /> <span>Teilen</span>
      </button>
      <button className="ctx-item" onClick={run(() => p.onStats(track))}>
        <IconStats size={20} /> <span>Statistiken für Interessierte</span>
      </button>
    </div>
  );
}
