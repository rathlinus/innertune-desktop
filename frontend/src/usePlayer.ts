import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "./types";
import { streamUrl } from "./api";
import { useNativeMedia } from "./useNativeMedia";
import { DEFAULTS, volumeGain, type VolumeCurve } from "./settings";

export interface PlayerOptions {
  // Slider-position → output-gain mapping. Read live, so changing it in
  // Settings re-tapers the volume immediately.
  volumeCurve?: VolumeCurve;
  // When false, start fresh on launch instead of restoring the last session.
  resumePlayback?: boolean;
  // Request the premium itag-141 stream. Read at track-load time, so toggling it
  // in Settings takes effect on the next track (not the one already playing).
  highQuality?: boolean;
}

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

// "Base recording" key used to dedupe the endless radio / autoplay queue.
//
// It ignores the OMV (music video) vs ATV (audio track) split — YouTube gives
// those different videoIds for the same song — AND collapses alternate versions
// of the same song: Radio Mix / Club Mix / Extended / New Version / Radio Edit /
// Remix / Remaster / Live, etc. YouTube's instant mix loves to surface five
// takes of one track, and without this the queue stacks them back-to-back (see
// "The Summer Is Magic (Radio Mix)" → "(Gambrinus Club Mix)"). We key on the
// normalized title only — the seed track's artist comes from a card subtitle
// like "Titel • …" and never matches the radio's byline, so artist is unreliable
// here. Drops *every* (…)/[…] parenthetical and trailing "- … " / "feat. …"
// tail, leaving just the core title. Used only when appending radio results;
// manual "Als Nächstes" / "In die Wiedergabeliste" keep distinct versions.
function songKey(title: string | null): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, " ") // drop all closed (…) and […] segments
    .replace(/[([][^)\]]*$/, " ") // …and an unclosed trailing one
    .replace(/\s[-–—]\s.*$/, " ") // drop "- Radio Edit" / "- Live" style tails
    .replace(/\bfeat\.?\b.*$/, " ") // drop "feat. …" credits
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
export function usePlayer(options: PlayerOptions = {}) {
  // Read the persisted snapshot exactly once so playback can be restored.
  // Honour the resume-playback setting: when off, keep the saved volume/
  // shuffle/repeat preferences but drop the track, queue and playhead.
  const [saved] = useState(() => {
    const snap = loadPersisted();
    if (!snap || options.resumePlayback === false) {
      return snap ? { ...snap, track: null, queue: [], index: -1, position: 0 } : null;
    }
    return snap;
  });

  // Live volume curve, mirrored in a ref so the setVolume callback and the
  // restore effect read the latest value without re-subscribing. Kept in sync
  // by the effect below (refs must not be written during render).
  const curveRef = useRef<VolumeCurve>(options.volumeCurve ?? DEFAULTS.volumeCurve);
  // Live high-quality preference, mirrored in a ref so streamUrl() reads the
  // latest value at track-load time without re-subscribing. Synced by the effect
  // below (refs must not be written during render).
  const hqRef = useRef<boolean>(options.highQuality ?? DEFAULTS.highQuality);

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
  // Tracks how the *current* track started: true when the player advanced on its
  // own (a song ended) or via forward-skip, false when the user picked the track
  // directly (play/playAt) or stepped back (prev). Read by the app to decide
  // whether a disliked track should be auto-skipped — only auto-advanced ones are.
  const autoAdvancedRef = useRef(false);

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
    (i: number, auto = false) => {
      const queue = queueRef.current;
      if (i < 0 || i >= queue.length) return;
      autoAdvancedRef.current = auto;
      indexRef.current = i;
      const track = queue[i];
      const audio = audioRef.current!;
      audio.src = streamUrl(track.videoId, hqRef.current);
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
      // Fall back to videoId when a title reduces to an empty key (e.g. a title
      // that is entirely a parenthetical) so unrelated tracks aren't merged.
      const keyOf = (t: Track) => songKey(t.title) || t.videoId;
      const have = new Set(queueRef.current.map(keyOf));
      const add: Track[] = [];
      for (const t of tracks) {
        if (!t.videoId) continue;
        const k = keyOf(t);
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

  // Collapse the queue to a single track WITHOUT restarting playback — used when
  // starting a radio from the song that's already playing. Keeps audio.src and
  // the playhead intact; radio tracks then append after this seed.
  const seedQueue = useCallback(
    (track: Track) => {
      queueRef.current = [track];
      indexRef.current = 0;
      patch({ queue: [track], index: 0, current: track });
      persist();
    },
    [patch, persist]
  );

  // "Als Nächstes abspielen" — insert one or more tracks right after the current
  // one (in order) so they play next without disturbing the rest of the queue.
  const playNext = useCallback(
    (track: Track | Track[]) => {
      const items = Array.isArray(track) ? track : [track];
      if (!items.length) return;
      const q = queueRef.current;
      const insertAt = indexRef.current < 0 ? q.length : indexRef.current + 1;
      const next = [...q.slice(0, insertAt), ...items, ...q.slice(insertAt)];
      queueRef.current = next;
      patch({ queue: next });
      persist();
    },
    [patch, persist]
  );

  // "In die Wiedergabeliste" — append one or more tracks to the end of the queue.
  const enqueue = useCallback(
    (track: Track | Track[]) => {
      const items = Array.isArray(track) ? track : [track];
      if (!items.length) return;
      const next = [...queueRef.current, ...items];
      queueRef.current = next;
      patch({ queue: next });
      persist();
    },
    [patch, persist]
  );

  // "Aus Wiedergabeliste entfernen" — drop the item at `i`, keeping the playing
  // track stable. Removing the current track advances to the one that shifts
  // into its slot (or stops if the queue empties).
  const removeFromQueue = useCallback(
    (i: number) => {
      const q = queueRef.current;
      if (i < 0 || i >= q.length) return;
      const cur = indexRef.current;
      const next = [...q.slice(0, i), ...q.slice(i + 1)];
      queueRef.current = next;
      if (i < cur) {
        indexRef.current = cur - 1;
        patch({ queue: next, index: indexRef.current });
      } else if (i === cur) {
        if (next.length === 0) {
          indexRef.current = -1;
          const audio = audioRef.current!;
          audio.pause();
          audio.removeAttribute("src");
          patch({ queue: next, index: -1, current: null, isPlaying: false });
        } else {
          patch({ queue: next });
          playIndex(Math.min(cur, next.length - 1));
        }
      } else {
        patch({ queue: next });
      }
      persist();
    },
    [patch, persist, playIndex]
  );

  // Drag-to-reorder: move the item at `from` to `to`, keeping the playing track
  // stable by following it to its new slot (or shifting its index when another
  // item jumps across it).
  const moveInQueue = useCallback(
    (from: number, to: number) => {
      const q = queueRef.current;
      if (from === to || from < 0 || from >= q.length || to < 0 || to >= q.length) return;
      const next = [...q];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      // Adjust the current index for the splice: removing `from` shifts later
      // items down, inserting at `to` shifts items at/after it up.
      const cur = indexRef.current;
      let newCur = cur;
      if (cur === from) newCur = to;
      else {
        if (from < cur) newCur -= 1;
        if (to <= newCur) newCur += 1;
      }
      indexRef.current = newCur;
      queueRef.current = next;
      patch({ queue: next, index: newCur });
      persist();
    },
    [patch, persist]
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current!;
    if (!state.current) return;
    // play() rejects (NotSupportedError / NotAllowedError) when the source failed
    // to load or autoplay is blocked. Swallow it instead of letting it surface as
    // an uncaught promise rejection; the error/onError handlers reset the UI.
    if (audio.paused) audio.play().catch(() => patch({ loading: false }));
    else audio.pause();
  }, [state.current, patch]);

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
    if (i >= 0) playIndex(i, true);
  }, [nextIndex, playIndex]);

  // Whether the current track started by auto-advancing (song ended / forward
  // skip) rather than a deliberate pick or a step-back. Lets the app auto-skip
  // disliked songs only when they came up on their own.
  const wasAutoAdvanced = useCallback(() => autoAdvancedRef.current, []);

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
      // `v` is the linear slider position (0..1); map it to output gain under
      // the user's chosen curve (see settings.volumeGain).
      audioRef.current!.volume = volumeGain(curveRef.current, v);
      volumeRef.current = v;
      patch({ volume: v });
      persist();
    },
    [patch, persist]
  );

  // Sync the curve ref and re-apply the gain when the volume curve changes, so
  // switching Linear/Exponential/Logarithmic in Settings takes effect without
  // touching the slider.
  useEffect(() => {
    curveRef.current = options.volumeCurve ?? DEFAULTS.volumeCurve;
    audioRef.current!.volume = volumeGain(curveRef.current, volumeRef.current);
  }, [options.volumeCurve]);

  // Keep the high-quality preference ref in sync; the new value is picked up the
  // next time a track loads (we don't reload the playing track mid-song).
  useEffect(() => {
    hqRef.current = options.highQuality ?? DEFAULTS.highQuality;
  }, [options.highQuality]);

  // Restore the audio element on first mount: apply the saved volume and queue
  // up the last track (paused — browsers block autoplay without a gesture).
  useEffect(() => {
    const audio = audioRef.current!;
    audio.volume = volumeGain(curveRef.current, volumeRef.current);
    const track = queueRef.current[indexRef.current] ?? saved?.track;
    if (track) {
      audio.src = streamUrl(track.videoId, hqRef.current);
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
        audio.play().catch(() => patch({ loading: false }));
        return;
      }
      const i = nextIndex();
      if (i >= 0) playIndex(i, true);
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

  // OS media integration: Windows SMTC (now-playing flyout + media keys) and the
  // taskbar thumbnail buttons / progress bar. No-ops in a plain browser.
  useNativeMedia({
    audioRef,
    current: state.current,
    isPlaying: state.isPlaying,
    position: state.position,
    duration: state.duration,
    controls: { toggle, next, prev, seek },
  });

  return {
    state,
    play,
    playAt: playIndex,
    seedQueue,
    appendQueue,
    playNext,
    enqueue,
    removeFromQueue,
    moveInQueue,
    toggle,
    next,
    prev,
    wasAutoAdvanced,
    seek,
    getCurrentTime,
    setVolume,
    toggleShuffle,
    cycleRepeat,
  };
}
