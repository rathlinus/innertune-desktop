import { useCallback, useEffect, useRef, useState } from "react";
import type { TransitionEvent } from "react";
import { getLyrics, getSimilar } from "./api";
import type { Lyrics, Track } from "./types";
import type { PlayerState } from "./usePlayer";
import type { MenuCtx } from "./TrackMenu";
import { IconCollapse, IconNote, IconPlay, IconPause } from "./icons";
import { Spinner } from "./Spinner";
import { Equalizer } from "./Equalizer";

/** "artist · album", dropping any empty parts. */
function subtitle(t: Track) {
  return [t.artist, t.album].filter(Boolean).join(" · ");
}

interface Props {
  state: PlayerState;
  open: boolean;
  onClosed: () => void;
  onClose: () => void;
  onToggle: () => void;
  onPlayAt: (i: number) => void;
  onPlay: (t: Track, queue: Track[]) => void;
  onMove?: (from: number, to: number) => void;
  onMenu?: (ctx: MenuCtx) => void;
}

export function FullscreenPlayer({
  state,
  open,
  onClosed,
  onClose,
  onToggle,
  onPlayAt,
  onPlay,
  onMove,
  onMenu,
}: Props) {
  const { current, isPlaying, loading, queue, index } = state;

  const [tab, setTab] = useState<"next" | "lyrics" | "related">("next");
  // Drag-to-reorder state for the "Als Nächstes" list (mirrors QueuePanel).
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [related, setRelated] = useState<Track[] | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // Detect tracks appended to the live queue (endless radio / autoplay) so the
  // new rows can fade in. Computed during render — the class is present on the
  // appended rows' first paint, so the entrance animation starts cleanly from
  // opacity 0 on mount. We only treat it as an append (not a queue replace)
  // when the head is unchanged and the length grew; `enterFrom` is the index of
  // the first new row. Refs advance after render.
  const prevLenRef = useRef(queue.length);
  const prevHeadRef = useRef<string | undefined>(queue[0]?.videoId);
  const headId = queue[0]?.videoId;
  const enterFrom =
    queue.length > prevLenRef.current && headId === prevHeadRef.current
      ? prevLenRef.current
      : Infinity;
  useEffect(() => {
    prevLenRef.current = queue.length;
    prevHeadRef.current = headId;
  }, [queue.length, headId]);

  // Keep the now-playing row scrolled to the top of the "Als Nächstes" list
  // (the full queue stays intact — past tracks just scroll out of view above).
  const queueRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open || tab !== "next") return;
    // rAF so layout is settled; instant scrollTop (a smooth scroll is ignored by
    // Chrome while the panel is still mid open-animation / not yet visible).
    const raf = requestAnimationFrame(() => {
      const c = queueRef.current;
      const el = activeRef.current;
      if (!c || !el) return;
      const top = c.scrollTop + (el.getBoundingClientRect().top - c.getBoundingClientRect().top);
      c.scrollTop = Math.max(0, top);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, tab, index]);

  // Fade the list edges that have hidden content beyond them: bottom when not
  // scrolled to the end, top when scrolled past the start. Recomputed on scroll
  // and whenever the list/active row changes (e.g. radio appends grow it).
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const updateEdges = useCallback(() => {
    const c = queueRef.current;
    if (!c) return;
    let atTop = c.scrollTop > 4;
    const atBottom = c.scrollTop + c.clientHeight < c.scrollHeight - 4;
    // Don't fade the top when the now-playing row is pinned to the very top
    // (the "perfectly scrolled" state set on open / track change) — otherwise
    // we'd dim the currently playing track.
    const el = activeRef.current;
    if (atTop && el) {
      const offset = el.getBoundingClientRect().top - c.getBoundingClientRect().top;
      if (Math.abs(offset) < 6) atTop = false;
    }
    setEdges((e) =>
      e.top === atTop && e.bottom === atBottom ? e : { top: atTop, bottom: atBottom }
    );
  }, []);
  useEffect(() => {
    if (!open || tab !== "next") return;
    const raf = requestAnimationFrame(updateEdges);
    return () => cancelAnimationFrame(raf);
  }, [open, tab, index, queue.length, updateEdges]);

  // Fetch lyrics lazily: only when the tab is open, and refetch per track.
  const currentId = current?.videoId;
  useEffect(() => {
    if (tab !== "lyrics" || !currentId) return;
    let cancelled = false;
    setLyrics(null);
    setLyricsLoading(true);
    getLyrics(currentId)
      .then((l) => !cancelled && setLyrics(l))
      .catch(() => !cancelled && setLyrics({ text: null, source: null }))
      .finally(() => !cancelled && setLyricsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab, currentId]);

  // Similar songs — fetched lazily when the tab is open, refetched per track.
  useEffect(() => {
    if (tab !== "related" || !currentId) return;
    let cancelled = false;
    setRelated(null);
    setRelatedLoading(true);
    getSimilar(currentId)
      .then((t) => !cancelled && setRelated(t))
      .catch(() => !cancelled && setRelated([]))
      .finally(() => !cancelled && setRelatedLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab, currentId]);

  // Drives the slide-up/down transition. Starts closed, then flips to the
  // `open` value on the next frame so the CSS transition always runs.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(open));
    return () => cancelAnimationFrame(id);
  }, [open]);

  // When the closing slide-down finishes, tell the parent to unmount us.
  const onTransitionEnd = (e: TransitionEvent) => {
    if (
      !open &&
      e.target === e.currentTarget &&
      (e.propertyName === "transform" || e.propertyName === "opacity")
    ) {
      onClosed();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!current) return null;

  return (
    <div
      className={`fsp ${shown ? "fsp-open" : ""}`}
      onTransitionEnd={onTransitionEnd}
    >
      {/* Blurred art backdrop */}
      {current.thumbnail && (
        <div
          key={current.videoId}
          className="fsp-backdrop fsp-backdrop-fade"
          style={{ backgroundImage: `url(${current.thumbnail})` }}
        />
      )}
      <div className="fsp-scrim" />

      <button className="fsp-close" onClick={onClose} title="Minimieren">
        <IconCollapse size={24} />
      </button>

      <div className="fsp-body">
        {/* Left: album art + meta — the focal point */}
        <div className="fsp-stage">
          <button
            className="fsp-art-wrap"
            onClick={onToggle}
            title="Wiedergabe/Pause"
          >
            {current.thumbnail ? (
              <img
                key={current.videoId}
                className="fsp-art fsp-art-fade"
                src={current.thumbnail}
                alt=""
              />
            ) : (
              <div className="fsp-art fsp-art-empty">
                <IconNote size={88} />
              </div>
            )}
            <span className="fsp-art-overlay">
              {loading ? (
                <Spinner size={64} />
              ) : isPlaying ? (
                <IconPause size={64} />
              ) : (
                <IconPlay size={64} />
              )}
            </span>
          </button>

          <div key={current.videoId} className="fsp-meta track-fade">
            <div className="fsp-title" title={current.title}>
              {current.title}
            </div>
            <div className="fsp-artist">
              {[current.artist, current.album, current.duration]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>

        {/* Right: tabbed queue panel */}
        <div className="fsp-panel">
          <div className="fsp-tabs">
            <button
              className={`fsp-tab ${tab === "next" ? "active" : ""}`}
              onClick={() => setTab("next")}
            >
              Als Nächstes
            </button>
            <button
              className={`fsp-tab ${tab === "lyrics" ? "active" : ""}`}
              onClick={() => setTab("lyrics")}
            >
              Songtext
            </button>
            <button
              className={`fsp-tab ${tab === "related" ? "active" : ""}`}
              onClick={() => setTab("related")}
            >
              Ähnliche Titel
            </button>
          </div>

          {tab === "next" && (
            <div
              className={`fsp-queue fsp-fade ${edges.top ? "fade-top" : ""} ${
                edges.bottom ? "fade-bottom" : ""
              }`}
              ref={queueRef}
              onScroll={updateEdges}
            >
              {queue.map((t, i) => {
                const isNew = i >= enterFrom;
                const dropCls =
                  overIndex === i && dragIndex !== null && dragIndex !== i
                    ? i > dragIndex
                      ? " fsp-q-drop-after"
                      : " fsp-q-drop-before"
                    : "";
                return (
                <button
                  key={`${t.videoId}-${i}`}
                  ref={i === index ? activeRef : undefined}
                  className={`fsp-q-item ${i === index ? "playing" : ""} ${isNew ? "fsp-q-enter" : ""}${
                    i === dragIndex ? " fsp-q-dragging" : ""
                  }${dropCls}`}
                  style={isNew ? { animationDelay: `${(i - enterFrom) * 45}ms` } : undefined}
                  draggable={!!onMove}
                  onDragStart={
                    onMove
                      ? (e) => {
                          setDragIndex(i);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(i));
                        }
                      : undefined
                  }
                  onDragOver={
                    onMove
                      ? (e) => {
                          if (dragIndex === null) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (overIndex !== i) setOverIndex(i);
                        }
                      : undefined
                  }
                  onDrop={
                    onMove
                      ? (e) => {
                          e.preventDefault();
                          if (dragIndex !== null && dragIndex !== i) onMove(dragIndex, i);
                          endDrag();
                        }
                      : undefined
                  }
                  onDragEnd={onMove ? endDrag : undefined}
                  onClick={() => onPlayAt(i)}
                  onContextMenu={
                    onMenu
                      ? (e) => {
                          e.preventDefault();
                          onMenu({ track: t, x: e.clientX, y: e.clientY, queueIndex: i });
                        }
                      : undefined
                  }
                >
                  <div className="fsp-q-art-wrap">
                    {t.thumbnail ? (
                      <img className="fsp-q-art" src={t.thumbnail} alt="" loading="lazy" />
                    ) : (
                      <div className="fsp-q-art fsp-q-art-empty">
                        <IconNote size={20} />
                      </div>
                    )}
                    {i === index && (
                      <span className="fsp-q-now">
                        <Equalizer />
                      </span>
                    )}
                  </div>
                  <div className="fsp-q-meta">
                    <div className="fsp-q-title">{t.title}</div>
                    <div className="fsp-q-artist">{subtitle(t)}</div>
                  </div>
                  {t.duration && <span className="fsp-q-dur">{t.duration}</span>}
                </button>
                );
              })}
            </div>
          )}

          {tab === "lyrics" && (
            lyricsLoading ? (
              <div className="fsp-empty fsp-fade">Songtext wird geladen …</div>
            ) : lyrics?.text ? (
              <div className="fsp-lyrics fsp-fade">
                <pre className="fsp-lyrics-text">{lyrics.text}</pre>
                {lyrics.source && (
                  <div className="fsp-lyrics-source">{lyrics.source}</div>
                )}
              </div>
            ) : (
              <div className="fsp-empty fsp-fade">
                Für diesen Titel ist kein Songtext verfügbar.
              </div>
            )
          )}
          {tab === "related" &&
            (relatedLoading ? (
              <div className="fsp-empty fsp-fade">Ähnliche Titel werden geladen …</div>
            ) : related && related.length > 0 ? (
              <div className="fsp-queue fsp-fade">
                {related.map((t, i) => (
                  <button
                    key={`${t.videoId}-${i}`}
                    className={`fsp-q-item ${t.videoId === currentId ? "playing" : ""}`}
                    onClick={() => onPlay(t, related)}
                    onContextMenu={
                      onMenu
                        ? (e) => {
                            e.preventDefault();
                            onMenu({ track: t, x: e.clientX, y: e.clientY });
                          }
                        : undefined
                    }
                  >
                    <div className="fsp-q-art-wrap">
                      {t.thumbnail ? (
                        <img className="fsp-q-art" src={t.thumbnail} alt="" loading="lazy" />
                      ) : (
                        <div className="fsp-q-art fsp-q-art-empty">
                          <IconNote size={20} />
                        </div>
                      )}
                      {t.videoId === currentId && (
                        <span className="fsp-q-now">
                          <Equalizer />
                        </span>
                      )}
                    </div>
                    <div className="fsp-q-meta">
                      <div className="fsp-q-title">{t.title}</div>
                      <div className="fsp-q-artist">{subtitle(t)}</div>
                    </div>
                    {t.duration && <span className="fsp-q-dur">{t.duration}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="fsp-empty fsp-fade">Keine ähnlichen Titel verfügbar.</div>
            ))}
        </div>
      </div>
    </div>
  );
}
