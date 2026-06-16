import { useEffect, useRef } from "react";
import type { Account } from "./types";
import { IconLogout, IconPerson } from "./icons";

// The account indicator's dropdown: shows the signed-in account (avatar, name,
// @handle) and a logout button. Clicking the avatar opens this instead of
// logging out directly. Closes on outside click / Escape.
interface Props {
  account: Account | null;
  onClose: () => void;
  onLogout: () => void;
}

export function AccountMenu({ account, onClose, onLogout }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="account-menu">
      <div className="account-head">
        {account?.photo ? (
          <img className="account-photo" src={account.photo} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="account-photo account-photo-empty">
            <IconPerson size={28} />
          </span>
        )}
        <div className="account-id">
          <div className="account-name">{account?.name ?? "Konto"}</div>
          {account?.handle && <div className="account-handle">{account.handle}</div>}
        </div>
      </div>
      <div className="account-divider" />
      <button className="account-action" onClick={onLogout}>
        <IconLogout size={20} />
        <span>Abmelden</span>
      </button>
    </div>
  );
}
