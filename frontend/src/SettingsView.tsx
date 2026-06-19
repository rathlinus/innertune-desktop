import { useEffect, useRef, useState } from "react";
import type { Settings, VolumeCurve } from "./settings";
import { perceivedLoudness, volumeGain } from "./settings";

// The Settings page, styled after YouTube Music's own settings: a centred
// column of titled sections, each a list of rows with a label + description on
// the left and a control (toggle / segmented choice) on the right.

interface Props {
  settings: Settings;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  // The player's current volume slider position (0..1), so the volume-curve
  // preview animates live as the player-bar slider is dragged.
  volume: number;
}

// A YT-Music-style pill toggle switch.
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`settings-toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}

// A segmented control for a small set of mutually exclusive choices.
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="settings-segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`settings-seg ${value === o.value ? "active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-title">{title}</div>
        <div className="settings-row-desc">{desc}</div>
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

const VOLUME_CURVES: { value: VolumeCurve; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "exponential", label: "Exponentiell" },
  { value: "logarithmic", label: "Logarithmisch" },
  { value: "antilog", label: "Antilog." },
];

const CURVE_DESC: Record<VolumeCurve, string> = {
  linear:
    "Die Lautstärke folgt direkt der Reglerposition. Fühlt sich oben schnell „voll laut“ an.",
  exponential:
    "Quadratische Kurve – feinfühlige Kontrolle im unteren Bereich, gleichmäßig für das Ohr.",
  logarithmic:
    "Schneller Anstieg, dann lange Feinabstufung oben – viel Auflösung bei hohen Pegeln.",
  antilog:
    "Gegenteil von logarithmisch: flacher Start, steiler Anstieg – erst ganz oben richtig laut.",
};

// Fixed graph height (px). The width is measured at runtime so the SVG is drawn
// 1:1 in real pixels — no viewBox scaling, so the curve and dots never stretch.
const GRAPH_H = 124;

// Build an SVG path that samples `fn` across the slider's travel (0..1) in real
// pixel coordinates. `close` finishes the path down to the baseline for a fill.
function buildPath(
  fn: (x: number) => number,
  w: number,
  h: number,
  close = false
): string {
  const steps = 56;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    const px = x * w;
    const py = h - fn(x) * h;
    d += `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
  }
  if (close) d += `L${w.toFixed(1)},${h} L0,${h} Z`;
  return d;
}

// Live preview for the chosen volume curve: the gain response (and the
// perceived-loudness response on top of it) as a graph, with a marker that
// tracks the player's current volume, plus the three live readouts.
function VolumePreview({ curve, volume }: { curve: VolumeCurve; volume: number }) {
  // Measure the drawing area so the SVG is rendered at its true pixel size.
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = GRAPH_H;
  const gain = volumeGain(curve, volume);
  const perceived = perceivedLoudness(gain);

  const gainLine = buildPath((x) => volumeGain(curve, x), w, h);
  const gainArea = buildPath((x) => volumeGain(curve, x), w, h, true);
  const heardLine = buildPath((x) => perceivedLoudness(volumeGain(curve, x)), w, h);

  const mx = volume * w;
  const gy = h - gain * h;
  const hy = h - perceived * h;

  return (
    <div className="vol-preview">
      <div className="vol-graph" ref={ref}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
          <defs>
            <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff0033" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ff0033" stopOpacity="0" />
            </linearGradient>
          </defs>
          {w > 0 && (
            <>
              {/* faint half-line grid + the perfectly-linear reference diagonal */}
              <line className="vol-grid" x1="0" y1={h / 2} x2={w} y2={h / 2} />
              <line className="vol-diag" x1="0" y1={h} x2={w} y2="0" />
              <path className="vol-fill" d={gainArea} fill="url(#volFill)" />
              <path className="vol-heard-line" d={heardLine} />
              <path className="vol-gain-line" d={gainLine} />
              {/* live marker tracking the player's volume */}
              <line className="vol-marker" x1={mx} y1="0" x2={mx} y2={h} />
              <circle className="vol-dot-heard" cx={mx} cy={hy} r="4" />
              <circle className="vol-dot-gain" cx={mx} cy={gy} r="5" />
            </>
          )}
        </svg>
      </div>
      <div className="vol-readouts">
        <div className="vol-stat">
          <span className="vol-stat-val">{Math.round(volume * 100)}%</span>
          <span className="vol-stat-label">Reglerposition</span>
        </div>
        <div className="vol-stat">
          <span className="vol-stat-val vol-stat-gain">{Math.round(gain * 100)}%</span>
          <span className="vol-stat-label">Ausgangspegel</span>
        </div>
        <div className="vol-stat">
          <span className="vol-stat-val vol-stat-heard">{Math.round(perceived * 100)}%</span>
          <span className="vol-stat-label">Wahrgenommen</span>
        </div>
      </div>
    </div>
  );
}

// The OS "launch at login" item only exists on the native desktop shell, and
// only Windows/macOS support it (Electron has no Linux login item). Hide the
// toggle elsewhere so we never show a control that does nothing.
const native = typeof window !== "undefined" ? window.native : undefined;
const SUPPORTS_AUTOSTART =
  !!native?.isDesktop && (native.platform === "win32" || native.platform === "darwin");

export function SettingsView({ settings, onChange, volume }: Props) {
  return (
    <div className="settings-view">
      <h1 className="page-title">Einstellungen</h1>

      {SUPPORTS_AUTOSTART && (
        <section className="settings-section">
          <h2 className="settings-heading">System</h2>

          <Row
            title="Mit dem System starten"
            desc="Innertune beim Anmelden automatisch starten – minimiert im Infobereich (Tray)."
          >
            <Toggle
              label="Mit dem System starten"
              checked={settings.autostart}
              onChange={(v) => onChange("autostart", v)}
            />
          </Row>
        </section>
      )}

      <section className="settings-section">
        <h2 className="settings-heading">Wiedergabe</h2>

        <Row
          title="Nicht gemochte Songs überspringen"
          desc="Mit „Daumen runter“ bewertete Songs werden in Radio und Autoplay automatisch übersprungen."
        >
          <Toggle
            label="Nicht gemochte Songs überspringen"
            checked={settings.skipDisliked}
            onChange={(v) => onChange("skipDisliked", v)}
          />
        </Row>

        <Row
          title="Endlose Wiedergabe"
          desc="Hält die Warteschlange am Ende einer Liste automatisch mit passendem Radio gefüllt."
        >
          <Toggle
            label="Endlose Wiedergabe"
            checked={settings.endlessAutoplay}
            onChange={(v) => onChange("endlessAutoplay", v)}
          />
        </Row>

        <Row
          title="Wiedergabe fortsetzen"
          desc="Beim Start den zuletzt gespielten Song, die Warteschlange und die Position wiederherstellen."
        >
          <Toggle
            label="Wiedergabe fortsetzen"
            checked={settings.resumePlayback}
            onChange={(v) => onChange("resumePlayback", v)}
          />
        </Row>
      </section>

      <section className="settings-section">
        <h2 className="settings-heading">Lautstärke</h2>

        <Row title="Lautstärkeregler-Kurve" desc={CURVE_DESC[settings.volumeCurve]}>
          <Segmented
            value={settings.volumeCurve}
            options={VOLUME_CURVES}
            onChange={(v) => onChange("volumeCurve", v)}
          />
        </Row>

        <VolumePreview curve={settings.volumeCurve} volume={volume} />

        <p className="vol-legend">
          <span className="vol-key vol-key-gain" /> Ausgangspegel
          <span className="vol-key vol-key-heard" /> Wahrgenommene Lautstärke
        </p>
      </section>
    </div>
  );
}
