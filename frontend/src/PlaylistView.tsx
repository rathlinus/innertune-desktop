import { useEffect, useState } from "react";
import type { PlaylistPage, Track } from "./types";
import { getPlaylist, removeFromPlaylist, deletePlaylist, renamePlaylist } from "./api";
import { TrackList } from "./TrackList";
import { IconPlay, IconShuffle, IconShare, IconThumbUp, IconTrash } from "./icons";

interface Props {
  playlistId: string;
  title: string; // fallback title until the header loads
  editable: boolean;
  nowId?: string;
  onPlay: (t: Track, queue: Track[]) => void;
  onMenu: (t: Track, e: React.MouseEvent) => void;
  onAdd: (t: Track) => void;
  onLike: (t: Track) => void;
  likes: Set<string>;
  onToast: (msg: string) => void;
  onChanged: () => void; // refresh the sidebar playlist list
  onDeleted: () => void; // navigate away after delete
}

// Shuffle a copy (Fisher–Yates) so "Mix" starts from a random order.
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The YT-Music playlist page: a sticky left column (cover art, title, owner,
// "type • year", "n Songs • duration", description, play/shuffle/share actions)
// and the track list on the right.
export function PlaylistView({
  playlistId,
  title,
  editable,
  nowId,
  onPlay,
  onMenu,
  onAdd,
  onLike,
  likes,
  onToast,
  onChanged,
  onDeleted,
}: Props) {
  const [page, setPage] = useState<PlaylistPage | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setPage(null);
    setErr(null);
    getPlaylist(playlistId)
      .then((p) => {
        setPage(p);
        setTracks(p.results);
      })
      .catch((e) => setErr(String(e)));
  }, [playlistId]);

  const name = page?.title || title;

  function playAll() {
    if (tracks.length) onPlay(tracks[0], tracks);
  }
  function shufflePlay() {
    if (!tracks.length) return;
    const order = shuffled(tracks);
    onPlay(order[0], order);
  }
  function share() {
    const url = `https://music.youtube.com/playlist?list=${
      playlistId.startsWith("VL") ? playlistId.slice(2) : playlistId
    }`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => onToast("Link in die Zwischenablage kopiert"))
      .catch(() => onToast(url));
  }
  async function rename() {
    const next = window.prompt("Playlist umbenennen:", name);
    if (!next?.trim() || next.trim() === name) return;
    try {
      await renamePlaylist(playlistId, next.trim());
      setPage((p) => (p ? { ...p, title: next.trim() } : p));
      onChanged();
      onToast("Umbenannt");
    } catch (e) {
      onToast(`Fehler: ${e}`);
    }
  }
  async function remove() {
    if (!window.confirm(`Playlist „${name}“ löschen?`)) return;
    try {
      await deletePlaylist(playlistId);
      onToast("Playlist gelöscht");
      onChanged();
      onDeleted();
    } catch (e) {
      onToast(`Fehler: ${e}`);
    }
  }
  async function removeTrack(t: Track) {
    if (!t.setVideoId) return;
    const prev = tracks;
    setTracks((ts) => ts.filter((x) => x.setVideoId !== t.setVideoId)); // optimistic
    try {
      await removeFromPlaylist(playlistId, [{ videoId: t.videoId, setVideoId: t.setVideoId }]);
      onToast("Aus Playlist entfernt");
    } catch (e) {
      setTracks(prev); // revert
      onToast(`Fehler: ${e}`);
    }
  }

  if (err) return <div className="status error">{err}</div>;

  return (
    <div className="playlist-page">
      <aside className="pl-hero">
        <div className="pl-cover">
          {page?.thumbnail ? (
            <img src={page.thumbnail} alt="" />
          ) : (
            <div className="pl-cover-empty">
              <IconThumbUp size={96} />
            </div>
          )}
        </div>
        <h1 className="pl-name">{name}</h1>
        {page?.owner && (
          <div className="pl-owner">
            {page.ownerThumbnail && <img className="pl-owner-art" src={page.ownerThumbnail} alt="" />}
            <span>{page.owner}</span>
          </div>
        )}
        {page?.subtitle && <div className="pl-meta">{page.subtitle}</div>}
        {page?.secondSubtitle && <div className="pl-meta pl-meta-dim">{page.secondSubtitle}</div>}
        {page?.description && <p className="pl-desc">{page.description}</p>}

        <div className="pl-actions">
          <button className="pl-play" onClick={playAll} disabled={!tracks.length} title="Abspielen">
            <IconPlay size={30} />
          </button>
          <button className="pl-act" onClick={shufflePlay} disabled={!tracks.length} title="Zufallswiedergabe">
            <IconShuffle size={22} />
          </button>
          <button className="pl-act" onClick={share} title="Teilen">
            <IconShare size={20} />
          </button>
          {editable && (
            <button className="pl-act" onClick={remove} title="Playlist löschen">
              <IconTrash size={20} />
            </button>
          )}
        </div>
        {editable && (
          <div className="pl-edit">
            <button className="btn-outline" onClick={rename}>
              Umbenennen
            </button>
          </div>
        )}
      </aside>

      <div className="pl-tracks">
        {!page ? (
          <div className="status">Wird geladen …</div>
        ) : tracks.length === 0 ? (
          <div className="status muted">Diese Playlist ist leer.</div>
        ) : (
          <TrackList
            tracks={tracks}
            nowId={nowId}
            onPlay={onPlay}
            onAdd={onAdd}
            onLike={onLike}
            likes={likes}
            onRemove={editable ? removeTrack : undefined}
            onMenu={onMenu}
          />
        )}
      </div>
    </div>
  );
}
