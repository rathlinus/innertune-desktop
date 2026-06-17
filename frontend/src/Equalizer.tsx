/**
 * Animated "now playing" equalizer glyph. The bars bounce continuously and
 * freeze in place whenever an ancestor carries the `paused` class — the app
 * root sets it while playback is paused (see App.tsx), so one root flag keeps
 * every indicator (queue, track rows, home cards) in sync with the transport.
 */
export function Equalizer({ className = "" }: { className?: string }) {
  return (
    <span className={`eq ${className}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
