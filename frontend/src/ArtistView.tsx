import { useEffect, useState } from "react";
import type { ArtistPage, HomeCard, Track } from "./types";
import { getArtist, subscribe } from "./api";
import { TrackList } from "./TrackList";
import { CardShelf } from "./CardShelf";
import { IconPlay } from "./icons";

interface Props {
  browseId: string;
  nowId?: string;
  onPlay: (t: Track, queue: Track[]) => void;
  onCard: (c: HomeCard) => void;
  onAdd?: (t: Track) => void;
}

export function ArtistView({ browseId, nowId, onPlay, onCard, onAdd }: Props) {
  const [data, setData] = useState<ArtistPage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    setData(null);
    setErr(null);
    getArtist(browseId)
      .then((d) => {
        setData(d);
        setSubscribed(d.subscribed);
      })
      .catch((e) => setErr(String(e)));
  }, [browseId]);

  if (err) return <div className="status error">{err}</div>;
  if (!data) return <div className="status">Wird geladen …</div>;

  const channelId = data.channelId ?? browseId;
  const toggleSub = async () => {
    const next = !subscribed;
    setSubscribed(next); // optimistic
    try {
      await subscribe(channelId, next);
    } catch {
      setSubscribed(!next);
    }
  };

  return (
    <div className="artist">
      <header className="artist-hero">
        {data.thumbnail && <img className="artist-hero-art" src={data.thumbnail} alt="" />}
        <div className="artist-hero-info">
          <h1 className="artist-hero-name">{data.name}</h1>
          {data.subscribers && (
            <div className="artist-hero-sub">{data.subscribers} Abonnenten</div>
          )}
          <div className="hero-actions">
            {data.songs.length > 0 && (
              <button className="btn-primary" onClick={() => onPlay(data.songs[0], data.songs)}>
                <IconPlay size={20} /> Abspielen
              </button>
            )}
            <button
              className={`btn-outline ${subscribed ? "btn-on" : ""}`}
              onClick={toggleSub}
            >
              {subscribed ? "Abonniert" : "Abonnieren"}
            </button>
          </div>
        </div>
      </header>

      {data.description && <p className="artist-desc">{data.description}</p>}

      {data.songs.length > 0 && (
        <>
          <h2 className="section-title">Songs</h2>
          <TrackList tracks={data.songs} nowId={nowId} onPlay={onPlay} onAdd={onAdd} />
        </>
      )}

      {data.shelves.map((sh) => (
        <CardShelf key={sh.title} shelf={sh} nowId={nowId} onCard={onCard} />
      ))}
    </div>
  );
}
