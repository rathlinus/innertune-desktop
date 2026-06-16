import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "./types";
import { streamUrl } from "./api";

export type RepeatMode = "off" | "all" | "one";

export interface PlayerState {
  current: Track | null;
  isPlaying: boolean;
  position: number; // seconds
  duration: number; // seconds
  volume: number; // 0..1
  loading: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  queue: Track[]; // full playback queue
  index: number; // index of `current` within `queue`
}

const STORAGE_KEY = "ytm.player.v1";

interface Persisted {
  track: Track | null;
  queue: Track[];
  index: number;
  position: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

// Song-identity key that ignores the OMV (music video) vs ATV (audio track)
// distinction — YouTube gives them different videoIds for the same song. Keys
// on the normalized title only (the seed track's artist comes from a card
// subtitle like "Titel • …" and never matches the radio's byline). Strips
// video-type markers ("(Lyric Video)") but keeps "(… Remix)". Keep in sync with
// songKey() in server/parse.ts.
const VIDEO_MARKER = /[([][^)\]]*\b(?:official|video|lyric|lyrics|audio|visuali\w*|clip|mv|hd|4k|hq)\b[^)\]]*[)\]]/g;
function songKey(title: string | null): string {
  return (title ?? "")
    .toLowerCase()
    .replace(VIDEO_MARKER, " ")
    .replace(/[([][^)\]]*$/, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

/**
 * Owns a single <audio> element and exposes simple transport controls plus a
 * queue. The whole app drives playback through this hook.
 */
export function usePlayer() {
  // Read the persisted snapshot exactly once so playback can be restored.
  const [saved] = useState(loadPersisted);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current) {
    audioRef.current = new Audio();
    audioRef.current.preload = "auto";
  }

  const queueRef = useRef<Track[]>(saved?.queue ?? []);
  const indexRef = useRef<number>(saved?.index ?? -1);
  // Mirror shuffle/repeat/volume in refs so the audio event handlers and the
  // persist() snapshot read live values without needing to re-subscribe.
  const shuffleRef = useRef(saved?.shuffle ?? false);
  const repeatRef = useRef<RepeatMode>(saved?.repeat ?? "off");
  const volumeRef = useRef(saved?.volume ?? 1);
  // One-shot: seek the restored track to its saved position once metadata loads.
  const pendingSeekRef = useRef<number | null>(saved?.track ? saved.position : null);
  const lastSaveRef = useRef(0);

  const [state, setState] = useState<PlayerState>({
    current: saved?.track ?? null,
    isPlaying: false,
    position: saved?.track ? saved.position : 0,
    duration: 0,
    volume: saved?.volume ?? 1,
    loading: false,
    shuffle: saved?.shuffle ?? false,
    repeat: saved?.repeat ?? "off",
    queue: saved?.queue ?? [],
    index: saved?.index ?? -1,
  });

  const patch = useCallback((p: Partial<PlayerState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  // Write the current playback snapshot to localStorage. Reads from refs so it
  // is safe to call from audio event handlers and unload listeners.
  const persist = useCallback(() => {
    try {
      const snap: Persisted = {
        track: queueRef.current[indexRef.current] ?? null,
        queue: queueRef.current,
        index: indexRef.current,
        position: audioRef.current?.currentTime ?? 0,
        volume: volumeRef.current,
        shuffle: shuffleRef.current,
        repeat: repeatRef.current,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
      lastSaveRef.current = Date.now();
    } catch {
      // Ignore quota/serialization errors — persistence is best-effort.
    }
  }, []);

  const playIndex = useCallback(
    (i: number) => {
      const queue = queueRef.current;
      if (i < 0 || i >= queue.length) return;
      indexRef.current = i;
      const track = queue[i];
      const audio = audioRef.current!;
      audio.src = streamUrl(track.videoId);
      patch({ current: track, index: i, loading: true, position: 0, duration: 0 });
      audio.play().catch(() => patch({ loading: false }));
    },
    [patch]
  );

  // Play a single track, optionally with surrounding queue context.
  const play = useCallback(
    (track: Track, queue?: Track[]) => {
      const list = queue ?? [track];
      queueRef.current = list;
      patch({ queue: list });
      const i = list.findIndex((t) => t.videoId === track.videoId);
      playIndex(i < 0 ? 0 : i);
    },
    [patch, playIndex]
  );

  // Append tracks to the live queue (used for endless autoplay / radio). Skips
  // songs already queued — keyed by song identity, not videoId, so the seed's
  // other OMV/ATV version (a different videoId for the same song) isn't appended
  // and played a second time ("the video then the audio").
  const appendQueue = useCallback(
    (tracks: Track[]) => {
      if (!tracks.length) return;
      const have = new Set(queueRef.current.map((t) => songKey(t.title)));
      const add: Track[] = [];
      for (const t of tracks) {
        if (!t.videoId) continue;
        const k = songKey(t.title);
        if (have.has(k)) continue;
        have.add(k);
        add.push(t);
      }
      if (!add.length) return;
      queueRef.current = [...queueRef.current, ...add];
      patch({ queue: queueRef.current });
      persist();
    },
    [patch, persist]
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current!;
    if (!state.current) return;
    if (audio.paused) audio.play();
    else audio.pause();
  }, [state.current]);

  // Pick the next index honoring shuffle; returns -1 at the end (no repeat-all).
  const nextIndex = useCallback((): number => {
    const queue = queueRef.current;
    if (queue.length === 0) return -1;
    if (shuffleRef.current) {
      if (queue.length === 1) return indexRef.current;
      let i = indexRef.current;
      while (i === indexRef.current) i = Math.floor(Math.random() * queue.length);
      return i;
    }
    const n = indexRef.current + 1;
    if (n >= queue.length) return repeatRef.current === "all" ? 0 : -1;
    return n;
  }, []);

  const next = useCallback(() => {
    const i = nextIndex();
    if (i >= 0) playIndex(i);
  }, [nextIndex, playIndex]);

  const toggleShuffle = useCallback(() => {
    shuffleRef.current = !shuffleRef.current;
    patch({ shuffle: shuffleRef.current });
    persist();
  }, [patch, persist]);

  const cycleRepeat = useCallback(() => {
    const order: RepeatMode[] = ["off", "all", "one"];
    const nextMode = order[(order.indexOf(repeatRef.current) + 1) % order.length];
    repeatRef.current = nextMode;
    patch({ repeat: nextMode });
    persist();
  }, [patch, persist]);

  const prev = useCallback(() => {
    const audio = audioRef.current!;
    // Restart current track if we're more than 3s in, else go back.
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
    } else {
      playIndex(indexRef.current - 1);
    }
  }, [playIndex]);

  const seek = useCallback((seconds: number) => {
    audioRef.current!.currentTime = seconds;
  }, []);

  // Live playhead, read on demand (e.g. from a rAF loop) so the UI can animate
  // the progress bar smoothly without routing 60fps updates through state.
  const getCurrentTime = useCallback(() => audioRef.current?.currentTime ?? 0, []);

  const setVolume = useCallback(
    (v: number) => {
      // `v` is the linear slider position (0..1). Human loudness perception is
      // roughly logarithmic, so a linear slider feels "all loud at the top".
      // Apply an exponential taper (squared) so the lower half of the slider
      // gives fine control and the travel feels even to the ear.
      audioRef.current!.volume = v * v;
      volumeRef.current = v;
      patch({ volume: v });
      persist();
    },
    [patch, persist]
  );

  // Restore the audio element on first mount: apply the saved volume and queue
  // up the last track (paused — browsers block autoplay without a gesture).
  useEffect(() => {
    const audio = audioRef.current!;
    audio.volume = volumeRef.current * volumeRef.current;
    const track = queueRef.current[indexRef.current] ?? saved?.track;
    if (track) {
      audio.src = streamUrl(track.videoId);
      audio.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wire up audio element events once.
  useEffect(() => {
    const audio = audioRef.current!;
    const onPlay = () => {
      patch({ isPlaying: true, loading: false });
      persist();
    };
    const onPause = () => {
      patch({ isPlaying: false });
      persist();
    };
    const onTime = () => {
      patch({ position: audio.currentTime });
      // Throttle position writes so we don't hammer localStorage each tick.
      if (Date.now() - lastSaveRef.current > 5000) persist();
    };
    const onMeta = () => {
      patch({ duration: audio.duration || 0 });
      // Restore the saved playhead on the very first track load.
      if (pendingSeekRef.current != null) {
        audio.currentTime = pendingSeekRef.current;
        pendingSeekRef.current = null;
      }
    };
    const onWaiting = () => patch({ loading: true });
    const onPlaying = () => patch({ loading: false });
    const onEnded = () => {
      if (repeatRef.current === "one") {
        audio.currentTime = 0;
        audio.play();
        return;
      }
      const i = nextIndex();
      if (i >= 0) playIndex(i);
    };
    const onError = () => {
      // A track failed to resolve/decode. Don't hang on the spinner.
      patch({ loading: false, isPlaying: false });
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    window.addEventListener("beforeunload", persist);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      window.removeEventListener("beforeunload", persist);
    };
  }, [patch, playIndex, nextIndex, persist]);

  // Hard teardown on unmount (React StrictMode's dev double-mount, and Vite HMR /
  // Fast Refresh while editing): pause and release THIS audio element. Without
  // this, a remounted player leaves the previous <audio> playing in the
  // background — uncontrollable — while the new instance plays its own track.
  useEffect(() => {
    const audio = audioRef.current!;
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, []);

  return {
    state,
    play,
    playAt: playIndex,
    appendQueue,
    toggle,
    next,
    prev,
    seek,
    getCurrentTime,
    setVolume,
    toggleShuffle,
    cycleRepeat,
  };
}
