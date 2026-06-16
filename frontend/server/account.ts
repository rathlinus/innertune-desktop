// Logged-in account info (name / @handle / avatar) for the account indicator.
//
// YouTube Music's WEB_REMIX account_menu doesn't carry the account header, but
// the classic account-switcher endpoint does — a plain cookie GET that returns
// every signed-in account with its name, channel handle and avatar. We pick the
// active one (isSelected) and cache it briefly (keyed on the captured session so
// a re-login or logout invalidates it).

import { getSession } from "./chrome";

export interface Account {
  name: string | null;
  handle: string | null;
  photo: string | null;
}

type Any = any;

function txt(node: Any): string | null {
  return node?.runs?.map((r: Any) => r.text).join("") ?? node?.simpleText ?? null;
}

function findAll(o: Any, key: string, out: Any[] = []): Any[] {
  if (Array.isArray(o)) {
    for (const v of o) findAll(v, key, out);
  } else if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) {
      if (k === key) out.push(v);
      findAll(v, key, out);
    }
  }
  return out;
}

const EMPTY: Account = { name: null, handle: null, photo: null };
let cache: { sig: number; data: Account } | null = null;

export async function account(): Promise<Account> {
  const s = getSession();
  if (!s) return EMPTY;
  if (cache && cache.sig === s.capturedAt) return cache.data;

  const res = await fetch("https://www.youtube.com/getAccountSwitcherEndpoint", {
    headers: {
      Cookie: s.cookie,
      "X-Goog-AuthUser": "0",
      Referer: "https://www.youtube.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) return EMPTY;

  // The body is JSON guarded by an anti-JSON-hijack prefix — strip it.
  const j = JSON.parse((await res.text()).replace(/^\)\]\}'/, ""));
  const items = findAll(j, "accountItem");
  const active = items.find((i: Any) => i.isSelected) ?? items[0];
  if (!active) return EMPTY;

  const thumbs = findAll(active, "thumbnails")[0] ?? [];
  let photo: string | null = thumbs[thumbs.length - 1]?.url ?? null;
  if (photo) photo = photo.replace(/=s\d+/, "=s176"); // crisper than the 48px default

  const data: Account = {
    name: txt(active.accountName),
    handle: findAll(active, "channelHandle").map(txt).find(Boolean) ?? null,
    photo,
  };
  cache = { sig: s.capturedAt, data };
  return data;
}
