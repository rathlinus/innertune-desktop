import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HomeCard } from "./types";
import {
  IconPlay,
  IconRadio,
  IconPlayNext,
  IconQueue,
  IconPerson,
  IconShare,
} from "./icons";

// Where a card's context menu was opened (right-click point or the ⋮ button).
export interface CardMenuCtx {
  card: HomeCard;
  x: number;
  y: number;
}

interface Props {
  ctx: CardMenuCtx;
  subscribed: boolean;
  onClose: () => void;
  onOpen: (c: HomeCard) => void;
  onRadio: (c: HomeCard) => void;
  onPlayNext: (c: HomeCard) => void;
  onEnqueue: (c: HomeCard) => void;
  onSubscribe: (c: HomeCard) => void;
  onShare: (c: HomeCard) => void;
}

// The right-click menu for playlist / album / artist cards (home, search,
// library, artist-page shelves). Video cards use TrackMenu instead. Items are
// kind-appropriate, mirroring the real YT Music card menu.
export function CardMenu(p: Props) {
  const { ctx } = p;
  const { card } = ctx;
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: ctx.x, y: ctx.y });
  // Artist cards arrive as kind "playlist" with a UC… browseId (there is no
  // distinct artist kind), so detect them by the channel-id prefix.
  const isArtist = !!card.browseId?.startsWith("UC");
  const queueable = !isArtist && (card.kind === "playlist" || card.kind === "album");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      x: Math.max(pad, Math.min(ctx.x, window.innerWidth - width - pad)),
      y: Math.max(pad, Math.min(ctx.y, window.innerHeight - height - pad)),
    });
  }, [ctx.x, ctx.y]);

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
      <button className="ctx-item" onClick={run(() => p.onOpen(card))}>
        <IconPlay size={20} /> <span>Öffnen</span>
      </button>
      <button className="ctx-item" onClick={run(() => p.onRadio(card))}>
        <IconRadio size={20} /> <span>Radio starten</span>
      </button>
      {queueable && (
        <>
          <button className="ctx-item" onClick={run(() => p.onPlayNext(card))}>
            <IconPlayNext size={20} /> <span>Als Nächstes abspielen</span>
          </button>
          <button className="ctx-item" onClick={run(() => p.onEnqueue(card))}>
            <IconQueue size={20} /> <span>In die Wiedergabeliste</span>
          </button>
        </>
      )}
      {isArtist && (
        <button
          className={`ctx-item ${p.subscribed ? "ctx-on" : ""}`}
          onClick={run(() => p.onSubscribe(card))}
        >
          <IconPerson size={20} /> <span>{p.subscribed ? "Abonniert" : "Abonnieren"}</span>
        </button>
      )}
      <button className="ctx-item" onClick={run(() => p.onShare(card))}>
        <IconShare size={20} /> <span>Teilen</span>
      </button>
    </div>
  );
}
