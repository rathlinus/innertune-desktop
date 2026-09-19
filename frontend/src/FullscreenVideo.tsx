import { useEffect, useRef, useState } from "react";
import { videoUrl } from "./api";
import type { VideoCounterpart, VideoSegment } from "./types";
import { IconFullscreen, IconFullscreenExit } from "./icons";
import { Spinner } from "./Spinner";

// "Titel / Video" toggle support for the fullscreen player.
//
// The audio never changes: whatever the <audio> element is playing (premium 141
// included) stays the source of truth. The "Video" view is a *muted*, video-only
// stream of the track's music video, kept in lockstep with the audio clock. For
// an audio track (ATV) the picture comes from its music-video counterpart (OMV),
// whose timeline is offset by the video's intro — the server hands us YouTube's
// own segment map to translate song time into video time.

// Song time → video time. Null when the video doesn't cover this part of the
// song (show the cover instead). No map means the timelines are identical.
function mapTime(t: number, segments: VideoSegment[] | null): number | null {
  if (!segments?.length) return t;
  for (const s of segments) {
    if (t >= s.primary && t < s.primary + s.duration) return s.counterpart + (t - s.primary);
  }
  return null;
}

// Beyond this the video is re-seeked; below it the drift is eased out by
// nudging the playback rate (seeking a video stalls it, so avoid it for jitter).
const SEEK_DRIFT = 0.6;
const NUDGE_DRIFT = 0.06;

interface Props {
  info: VideoCounterpart;
  thumbnail: string | null;
  isPlaying: boolean;
  getCurrentTime: () => number;
  onToggle: () => void;
  // Reports the video's real aspect ratio (width / height) once known, so the
  // stage can line the title up with the picture.
  onAspect?: (ratio: number) => void;
}

export function VideoStage({ info, thumbnail, isPlaying, getCurrentTime, onToggle, onAspect }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // The video has no picture for the current song position (outside the map).
  const [uncovered, setUncovered] = useState(false);
  const [isFs, setIsFs] = useState(false);

  const playingRef = useRef(isPlaying);
  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  // Follow the audio clock. A short interval (not rAF) is plenty: the rate
  // nudge absorbs sub-tick drift, and it keeps the loop cheap.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => {
      const target = mapTime(getCurrentTime(), info.segments);
      setUncovered(target == null);
      if (target == null) {
        if (!v.paused) v.pause();
        return;
      }
      if (v.readyState >= 1 && !v.seeking) {
        const drift = v.currentTime - target;
        if (Math.abs(drift) > SEEK_DRIFT) {
          v.currentTime = target;
          v.playbackRate = 1;
        } else if (Math.abs(drift) > NUDGE_DRIFT) {
          v.playbackRate = drift > 0 ? 0.94 : 1.06;
        } else {
          v.playbackRate = 1;
        }
      }
      if (playingRef.current && v.paused) v.play().catch(() => {});
      else if (!playingRef.current && !v.paused) v.pause();
    };
    sync();
    const id = window.setInterval(sync, 200);
    return () => window.clearInterval(id);
  }, [info, getCurrentTime]);

  useEffect(() => {
    const onFs = () => setIsFs(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFs = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else wrapRef.current?.requestFullscreen().catch(() => {});
  };

  const showCover = failed || uncovered || !ready;

  return (
    <div
      ref={wrapRef}
      className="fsp-video-wrap fsp-art-fade"
      onClick={onToggle}
      title="Wiedergabe/Pause"
    >
      {!failed && info.videoId && (
        <video
          ref={videoRef}
          className="fsp-video"
          src={videoUrl(info.videoId)}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => {
            const { videoWidth: w, videoHeight: h } = e.currentTarget;
            if (w && h) onAspect?.(w / h);
          }}
          onLoadedData={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      )}
      {/* The cover fills in while the video loads, where it has no picture for
          this part of the song, or when it can't be streamed at all. */}
      <div className={`fsp-video-cover ${showCover ? "shown" : ""}`}>
        {thumbnail && <img src={thumbnail} alt="" />}
        {!ready && !failed && !uncovered && (
          <span className="fsp-video-loading">
            <Spinner size={48} />
          </span>
        )}
      </div>
      <button
        className="fsp-video-btn"
        onClick={toggleFs}
        title={isFs ? "Vollbild beenden" : "Vollbild"}
      >
        {isFs ? <IconFullscreenExit size={26} /> : <IconFullscreen size={26} />}
      </button>
    </div>
  );
}
