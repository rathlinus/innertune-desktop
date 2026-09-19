// Keep the local server on the same port across launches.
//
// The renderer is loaded from http://127.0.0.1:<port>, and Chromium keys
// localStorage by origin — port included. With a fresh ephemeral port every
// launch, each start saw an empty localStorage: settings, the resumed queue and
// every other client-side preference silently reset on restart. So the port the
// server first lands on is saved in userData and reused from then on; only if
// it's taken (another program grabbed it) do we fall back to a new free port,
// which is then saved in turn.

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

function portFile(): string {
  return path.join(app.getPath("userData"), "server-port.json");
}

const validPort = (p: unknown): p is number =>
  typeof p === "number" && Number.isInteger(p) && p > 1024 && p < 65536;

// Builds before this file existed used a new random port per launch, so their
// data is spread across one localStorage origin per session. The most recently
// written one is in the newest leveldb log; reusing its port on the first launch
// carries the user's latest settings over instead of starting from defaults.
// Best effort only — any failure just means defaults.
function lastUsedPortFromStorage(): number | null {
  try {
    const dir = path.join(app.getPath("userData"), "Local Storage", "leveldb");
    const newest = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".log") || f.endsWith(".ldb"))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0];
    if (!newest) return null;
    const text = fs.readFileSync(path.join(dir, newest.f), "latin1");
    const ports = [...text.matchAll(/http:\/\/127\.0\.0\.1:(\d{2,5})/g)].map((m) => Number(m[1]));
    const last = ports[ports.length - 1];
    return validPort(last) ? last : null;
  } catch {
    return null;
  }
}

export function loadServerPort(): number | null {
  try {
    const p = JSON.parse(fs.readFileSync(portFile(), "utf8"))?.port;
    if (validPort(p)) return p;
  } catch {
    /* first run on this build */
  }
  return lastUsedPortFromStorage();
}

export function saveServerPort(port: number): void {
  try {
    fs.writeFileSync(portFile(), JSON.stringify({ port }));
  } catch {
    /* best effort — next launch just picks a port again */
  }
}
