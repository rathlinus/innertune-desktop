import { useEffect, useState } from "react";
import type { StreamInfo, Track } from "./types";
import { getPlayerInfo } from "./api";
import { IconClose } from "./icons";

// "Statistiken für Interessierte" — a small overlay with the technical details
// of the audio stream the player is actually pulling (itag/codec/bitrate/…),
// fetched from the ANDROID_VR player response via /api/player-info.
export function StatsModal({
  track,
  hq = false,
  onClose,
}: {
  track: Track;
  hq?: boolean;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<StreamInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    getPlayerInfo(track.videoId, hq)
      .then((i) => !cancel && setInfo(i))
      .catch((e) => !cancel && setErr(String(e)));
    return () => {
      cancel = true;
    };
  }, [track.videoId, hq]);

  const mb = (n: string | null) =>
    n ? `${(Number(n) / 1_048_576).toFixed(1)} MB` : "—";
  const kbps = (n: number | null) => (n ? `${Math.round(n / 1000)} kbps` : "—");

  const rows: [string, string][] = info
    ? [
        ["Video-ID", info.videoId],
        ["itag", String(info.itag ?? "—")],
        ["Codec", info.codec ?? "—"],
        ["Container", info.container ?? "—"],
        ["Bitrate", kbps(info.bitrate)],
        ["Ø Bitrate", kbps(info.averageBitrate)],
        ["Abtastrate", info.audioSampleRate ? `${info.audioSampleRate} Hz` : "—"],
        ["Kanäle", String(info.audioChannels ?? "—")],
        ["Größe", mb(info.contentLength)],
        ["Lautheit", info.loudnessDb != null ? `${info.loudnessDb.toFixed(1)} dB` : "—"],
        ["Client", info.client],
      ]
    : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal stats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Statistiken für Interessierte</h2>
          <button className="icon-btn" onClick={onClose} title="Schließen">
            <IconClose size={22} />
          </button>
        </div>
        <div className="stats-title">{track.title}</div>
        {err && <div className="status error">{err}</div>}
        {!info && !err && <div className="status">Wird geladen …</div>}
        {info && (
          <table className="stats-table">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td className="stats-key">{k}</td>
                  <td className="stats-val">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
