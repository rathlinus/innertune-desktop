import { useEffect, useState } from "react";
import type { Playlist } from "./types";
import { addToPlaylist, createPlaylist, getPlaylists } from "./api";
import { IconAdd } from "./icons";

interface Props {
  videoId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}

// Pick a playlist to add the track to, or create a new one. Used from the
// "+" action on track rows.
export function AddToPlaylistModal({ videoId, onClose, onDone }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    getPlaylists().then(setPlaylists).catch(() => setPlaylists([]));
  }, []);

  async function add(playlistId: string, title: string) {
    if (busy) return;
    setBusy(true);
    try {
      await addToPlaylist(playlistId, [videoId]);
      onDone(`Zu „${title}“ hinzugefügt`);
      onClose();
    } catch (e) {
      onDone(`Fehler: ${e}`);
      setBusy(false);
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const id = await createPlaylist(name);
      if (id) await addToPlaylist(id, [videoId]);
      onDone(`Playlist „${name}“ erstellt`);
      onClose();
    } catch (e) {
      onDone(`Fehler: ${e}`);
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>
        <h2>Zu Playlist hinzufügen</h2>

        {creating ? (
          <div className="modal-form">
            <label>Name der neuen Playlist</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
              placeholder="Meine Playlist"
            />
            <button className="modal-btn" onClick={createAndAdd} disabled={busy || !newName.trim()}>
              Erstellen & hinzufügen
            </button>
          </div>
        ) : (
          <div className="pl-picker">
            <button className="pl-pick pl-pick-new" onClick={() => setCreating(true)}>
              <span className="pl-pick-icon">
                <IconAdd size={20} />
              </span>
              Neue Playlist
            </button>
            {playlists.map((p) => (
              <button
                key={p.playlistId}
                className="pl-pick"
                onClick={() => add(p.playlistId, p.title)}
                disabled={busy}
              >
                {p.thumbnail ? (
                  <img className="pl-pick-art" src={p.thumbnail} alt="" loading="lazy" />
                ) : (
                  <span className="pl-pick-art pl-pick-art-empty" />
                )}
                <span className="pl-pick-title">{p.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
