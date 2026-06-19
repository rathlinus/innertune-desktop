import type { CSSProperties, MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { fmtTime } from "./format";
import type { PlayerState } from "./usePlayer";
import { Spinner } from "./Spinner";
import {
  IconPlay,
  IconPause,
  IconPrev,
  IconNext,
  IconShuffle,
  IconRepeat,
  IconRepeatOne,
  IconVolume,
  IconVolumeMute,
  IconThumbUp,
  IconThumbDown,
  IconMore,
  IconQueue,
  IconExpand,
} from "./icons";

interface Props {
  state: PlayerState;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (s: number) => void;
  getCurrentTime: () => number;
  onVolume: (v: number) => void;
  onShuffle: () => void;
  onRepeat: () => void;
  onExpand: () => void;
  liked?: boolean;
  disliked?: boolean;
  onLike?: () => void;
  onDislike?: () => void;
  onMenu?: (e: MouseEvent) => void;
  onQueue?: () => void;
  queueOpen?: boolean;
}

function fill(pct: number, color: string): CSSProperties {
  // Drives the thin runnable-track line via a CSS var; the visible thickness is
  // fixed in CSS, independent of the tall (clickable) input height.
  return {
    "--fill": `linear-gradient(to right, ${color} ${pct}%, #4d4d4d ${pct}%)`,
  } as CSSProperties;
}

export function PlayerBar({
  state,
  onToggle,
  onNext,
  onPrev,
  onSeek,
  getCurrentTime,
  onVolume,
  onShuffle,
  onRepeat,
  onExpand,
  liked,
  disliked,
  onLike,
  onDislike,
  onMenu,
  onQueue,
  queueOpen,
}: Props) {
  const { current, isPlaying, loading, position, duration, volume, shuffle, repeat } =
    state;

  // The audio element only emits `timeupdate` ~4x/sec, which makes the playhead
  // and time text jump. Sample the live currentTime every animation frame while
  // playing for smooth motion (kept local so only this bar re-renders).
  const [smoothPos, setSmoothPos] = useState(position);
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      setSmoothPos(getCurrentTime());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, getCurrentTime]);
  // When paused, seeked, or on track change, mirror the authoritative position.
  useEffect(() => {
    if (!isPlaying) setSmoothPos(position);
  }, [isPlaying, position]);

  const progressPct = duration ? (smoothPos / duration) * 100 : 0;
  const volPct = volume * 100;

  // Remember the last non-zero volume so unmuting restores it instead of
  // jumping to full. Updated in an effect (refs must not be written in render).
  const lastVolRef = useRef(volume || 1);
  useEffect(() => {
    if (volume > 0) lastVolRef.current = volume;
  }, [volume]);
  const toggleMute = () => onVolume(volume > 0 ? 0 : lastVolRef.current || 1);

  // Scroll-to-adjust: hovering the volume control and scrolling nudges the
  // volume up/down. A native, non-passive wheel listener lets us preventDefault
  // so the page doesn't scroll. Re-bound on volume/onVolume change so it always
  // reads the current value.
  const volRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = volRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1; // scroll up = louder
      const next = Math.min(1, Math.max(0, volume + dir * 0.05));
      onVolume(Math.round(next * 100) / 100);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [volume, onVolume]);

  const onBarClick = (e: MouseEvent) => {
    // Ignore clicks on the interactive controls (buttons, sliders).
    if ((e.target as HTMLElement).closest("button, input")) return;
    if (current) onExpand();
  };

  return (
    <footer className="player" onClick={onBarClick}>
      <input
        className="scrubber"
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={smoothPos}
        style={fill(progressPct, "var(--accent)")}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
      />

      <div className="player-grid">
        {/* Left: transport controls + time */}
        <div className="player-left">
          <button className="ctrl" onClick={onPrev} title="Zurück">
            <IconPrev size={28} />
          </button>
          <button className="ctrl ctrl-main" onClick={onToggle} title="Wiedergabe/Pause">
            {loading ? (
              <Spinner size={30} />
            ) : isPlaying ? (
              <IconPause size={38} />
            ) : (
              <IconPlay size={38} />
            )}
          </button>
          <button className="ctrl" onClick={onNext} title="Weiter">
            <IconNext size={28} />
          </button>
          <span className="time">
            {fmtTime(smoothPos)} / {fmtTime(duration || 0)}
          </span>
        </div>

        {/* Center: current track + like/dislike/overflow */}
        <div className="player-track">
          <button
            className="player-art-btn"
            onClick={onToggle}
            disabled={!current}
            title="Wiedergabe/Pause"
          >
            {current?.thumbnail ? (
              <img
                key={`art-${current.videoId}`}
                className="player-art track-fade"
                src={current.thumbnail}
                alt=""
              />
            ) : (
              <div className="player-art player-art-empty" />
            )}
            <span className="player-art-overlay">
              {loading ? (
                <Spinner size={20} />
              ) : isPlaying ? (
                <IconPause size={22} />
              ) : (
                <IconPlay size={22} />
              )}
            </span>
          </button>
          <div key={`meta-${current?.videoId}`} className="player-meta track-fade">
            <div className="player-title">
              {current?.title ?? "Nichts wird abgespielt"}
            </div>
            <div className="player-artist">
              {[current?.artist, current?.album].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button
            className={`ctrl ctrl-sm ${liked ? "ctrl-on" : ""}`}
            onClick={onLike}
            disabled={!current}
            title="Mag ich"
          >
            <IconThumbUp size={20} active={liked} />
          </button>
          <button
            className={`ctrl ctrl-sm ${disliked ? "ctrl-on" : ""}`}
            onClick={onDislike}
            disabled={!current}
            title="Mag ich nicht"
          >
            <IconThumbDown size={20} active={disliked} />
          </button>
          <button
            className="ctrl ctrl-sm"
            title="Mehr"
            disabled={!current}
            onClick={(e) => current && onMenu?.(e)}
          >
            <IconMore size={22} />
          </button>
        </div>

        {/* Right: volume / repeat / shuffle / expand */}
        <div className="player-right">
          <div className="vol-control" ref={volRef} title="Scrollen zum Anpassen">
            <button
              className="ctrl ctrl-sm"
              onClick={toggleMute}
              title="Stummschalten"
            >
              {volume > 0 ? <IconVolume size={22} /> : <IconVolumeMute size={22} />}
            </button>
            <input
              className="vol"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              style={fill(volPct, "#fff")}
              onChange={(e) => onVolume(parseFloat(e.target.value))}
            />
          </div>
          <button
            className={`ctrl ctrl-sm ${repeat !== "off" ? "ctrl-on" : ""}`}
            onClick={onRepeat}
            title="Wiederholen"
          >
            {repeat === "one" ? (
              <IconRepeatOne size={22} />
            ) : (
              <IconRepeat size={22} active={repeat !== "off"} />
            )}
          </button>
          <button
            className={`ctrl ctrl-sm ${shuffle ? "ctrl-on" : ""}`}
            onClick={onShuffle}
            title="Zufallswiedergabe"
          >
            <IconShuffle size={22} active={shuffle} />
          </button>
          <button
            className={`ctrl ctrl-sm ${queueOpen ? "ctrl-on" : ""}`}
            onClick={onQueue}
            title="Wiedergabeliste"
          >
            <IconQueue size={22} />
          </button>
          <button
            className="ctrl ctrl-sm"
            onClick={onExpand}
            disabled={!current}
            title="Vollbild"
          >
            <IconExpand size={22} />
          </button>
        </div>
      </div>
    </footer>
  );
}
