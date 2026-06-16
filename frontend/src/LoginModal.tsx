import { useEffect, useRef, useState } from "react";
import { getAuthStatus, startLogin } from "./api";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

type Phase = "intro" | "waiting" | "error";

export function LoginModal({ onClose, onSuccess }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function begin() {
    setError(null);
    setPhase("waiting");
    try {
      await startLogin();
    } catch (e) {
      setError(String(e));
      setPhase("error");
      return;
    }
    // Poll until the background CDP capture lands (or errors out).
    pollRef.current = setInterval(async () => {
      try {
        const s = await getAuthStatus();
        if (s.authenticated) {
          if (pollRef.current) clearInterval(pollRef.current);
          onSuccess();
        } else if (s.login?.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          setError(s.login.message);
          setPhase("error");
        }
      } catch {
        /* keep polling */
      }
    }, 1500);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>

        <h2>Connect your account</h2>

        {phase === "intro" && (
          <>
            <p className="modal-sub">
              This opens a dedicated Chrome window. Sign in to YouTube Music
              there once — the app captures your session automatically and uses
              it to load your library, lyrics, and premium-quality audio. Your
              login stays in a local profile; nothing is sent anywhere else.
            </p>
            <button className="modal-btn" onClick={begin}>
              Open Chrome &amp; sign in
            </button>
          </>
        )}

        {phase === "waiting" && (
          <>
            <p className="modal-sub">
              A Chrome window should have opened at{" "}
              <strong>music.youtube.com</strong>. Sign in there (including any
              2-step verification). As soon as you're in, this will continue on
              its own — you can leave that window open.
            </p>
            <div className="modal-waiting">Waiting for sign-in …</div>
          </>
        )}

        {phase === "error" && (
          <>
            <p className="modal-sub">Login didn't complete.</p>
            <div className="modal-error">{error}</div>
            <button className="modal-btn" onClick={begin}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
