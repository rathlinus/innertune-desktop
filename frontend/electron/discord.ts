// Discord Rich Presence — "Listening to …" with cover art and an elapsed bar.
//
// Implemented against Discord's local IPC protocol directly (no discord-rpc
// dependency), in the same spirit as the rest of this project. The Discord
// desktop client exposes a named pipe (\\.\pipe\discord-ipc-N on Windows, a unix
// socket under $XDG_RUNTIME_DIR / tmp elsewhere). Framing is:
//   [int32-LE opcode][int32-LE byte length][utf8 JSON payload]
// Handshake with opcode 0 {v:1,client_id}; once Discord DISPATCHes READY we send
// SET_ACTIVITY frames (opcode 1). If Discord isn't running we just keep retrying
// quietly in the background.
//
// REQUIRES a Discord application id: the name Discord shows ("… is listening to
// <APP NAME>") is the application's name, so you must register one at
// https://discord.com/developers/applications and put its id below (or in the
// YTM_DISCORD_CLIENT_ID env var). With no id the whole integration is a no-op.

import net from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Paste your Discord application id here (or set YTM_DISCORD_CLIENT_ID). Empty =
// Rich Presence disabled.
const DEFAULT_CLIENT_ID = "";

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

export interface PlaybackInfo {
  hasTrack: boolean;
  isPlaying: boolean;
  position: number; // seconds
  duration: number; // seconds
  title?: string;
  artist?: string;
  album?: string | null;
  artwork?: string | null;
}

interface Activity {
  type: number;
  details?: string;
  state?: string;
  assets?: { large_image?: string; large_text?: string };
  timestamps?: { start?: number; end?: number };
}

// Discord rejects details/state shorter than 2 bytes and longer than 128.
function clampText(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (t.length < 2) return undefined;
  return t.length > 128 ? t.slice(0, 127) + "…" : t;
}

// Candidate IPC endpoints, in connection-attempt order. Discord uses sockets 0-9
// and, on Linux, may live inside a flatpak/snap runtime subdirectory.
function candidatePaths(): string[] {
  const out: string[] = [];
  if (process.platform === "win32") {
    for (let i = 0; i < 10; i++) out.push(`\\\\?\\pipe\\discord-ipc-${i}`);
    return out;
  }
  const bases = [
    process.env.XDG_RUNTIME_DIR,
    process.env.TMPDIR,
    process.env.TMP,
    process.env.TEMP,
    "/tmp",
  ].filter((b): b is string => !!b);
  const subdirs = ["", "app/com.discordapp.Discord/", "snap.discord/"];
  for (let i = 0; i < 10; i++)
    for (const base of bases)
      for (const sub of subdirs) out.push(path.join(base, sub, `discord-ipc-${i}`));
  return out;
}

export class DiscordPresence {
  private readonly clientId: string;
  private socket: net.Socket | null = null;
  private ready = false;
  private buf = Buffer.alloc(0);
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  private pending: Activity | null = null;
  // Anchors used to decide whether a snapshot is a real change (track / play
  // state / seek) versus just the playhead ticking forward on its own.
  private sentVideoKey = "";
  private sentPlaying = false;
  private sentAt = 0;
  private sentPosition = 0;

  constructor(clientId = process.env.YTM_DISCORD_CLIENT_ID || DEFAULT_CLIENT_ID) {
    this.clientId = clientId;
  }

  get enabled(): boolean {
    return !!this.clientId;
  }

  start(): void {
    if (!this.enabled || this.destroyed) return;
    this.connect();
  }

  private connect(): void {
    if (this.destroyed || this.socket) return;
    const paths = candidatePaths();
    const tryAt = (i: number): void => {
      if (this.destroyed) return;
      if (i >= paths.length) {
        this.scheduleReconnect();
        return;
      }
      const sock = net.connect(paths[i]);
      const onErr = () => {
        sock.removeAllListeners();
        sock.destroy();
        tryAt(i + 1);
      };
      sock.once("error", onErr);
      sock.once("connect", () => {
        sock.removeListener("error", onErr);
        this.socket = sock;
        this.buf = Buffer.alloc(0);
        sock.on("data", (d) => this.onData(d));
        sock.on("error", () => this.drop());
        sock.on("close", () => this.drop());
        this.send(OP_HANDSHAKE, { v: 1, client_id: this.clientId });
      });
    };
    tryAt(0);
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 15_000);
  }

  private drop(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
    }
    this.socket = null;
    this.ready = false;
    if (!this.destroyed) this.scheduleReconnect();
  }

  private send(op: number, payload: unknown): void {
    if (!this.socket) return;
    const json = Buffer.from(JSON.stringify(payload), "utf8");
    const header = Buffer.alloc(8);
    header.writeInt32LE(op, 0);
    header.writeInt32LE(json.length, 4);
    try {
      this.socket.write(Buffer.concat([header, json]));
    } catch {
      this.drop();
    }
  }

  private onData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
    // Drain every complete frame currently buffered.
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0);
      const len = this.buf.readInt32LE(4);
      if (this.buf.length < 8 + len) break;
      const body = this.buf.subarray(8, 8 + len);
      this.buf = this.buf.subarray(8 + len);
      this.handleFrame(op, body);
    }
  }

  private handleFrame(op: number, body: Buffer): void {
    if (op === OP_PING) {
      this.send(OP_PONG, JSON.parse(body.toString("utf8") || "{}"));
      return;
    }
    if (op === OP_CLOSE) {
      this.drop();
      return;
    }
    if (op !== OP_FRAME) return;
    let msg: { evt?: string; cmd?: string } = {};
    try {
      msg = JSON.parse(body.toString("utf8"));
    } catch {
      return;
    }
    if (msg.cmd === "DISPATCH" && msg.evt === "READY") {
      this.ready = true;
      this.flush(); // push whatever the latest activity is
    }
  }

  private toActivity(s: PlaybackInfo): Activity | null {
    if (!s.hasTrack) return null;
    const act: Activity = {
      type: 2, // LISTENING → header reads "Listening to <app name>"
      details: clampText(s.title),
      state: clampText(s.artist),
    };
    if (s.artwork) {
      act.assets = { large_image: s.artwork, large_text: clampText(s.album ?? s.title) };
    }
    // Only show the progress bar while playing; Discord can't render a frozen
    // playhead, so a paused track just drops the timestamps.
    if (s.isPlaying && s.duration > 0 && s.position >= 0 && s.position <= s.duration) {
      const now = Date.now();
      act.timestamps = {
        start: now - Math.floor(s.position * 1000),
        end: now + Math.floor((s.duration - s.position) * 1000),
      };
    }
    return act;
  }

  // Decide whether this snapshot differs meaningfully from what we last sent.
  // The playhead ticking forward on its own is NOT a change (Discord
  // extrapolates the bar from start/end), but a track change, a play/pause, or a
  // seek (the position jumping away from where we'd predict it) all are.
  private isMeaningfulChange(s: PlaybackInfo): boolean {
    const key = s.hasTrack ? `${s.title ?? ""}|${s.artist ?? ""}` : "";
    if (key !== this.sentVideoKey) return true;
    if (s.isPlaying !== this.sentPlaying) return true;
    if (!s.isPlaying) return false;
    const predicted = this.sentPosition + (Date.now() - this.sentAt) / 1000;
    return Math.abs(s.position - predicted) > 3;
  }

  update(s: PlaybackInfo): void {
    if (!this.enabled || this.destroyed) return;
    if (!this.isMeaningfulChange(s)) return;
    this.sentVideoKey = s.hasTrack ? `${s.title ?? ""}|${s.artist ?? ""}` : "";
    this.sentPlaying = s.isPlaying;
    this.sentAt = Date.now();
    this.sentPosition = s.position;
    this.pending = this.toActivity(s);
    this.flush();
  }

  private flush(): void {
    if (!this.ready || !this.socket) return;
    this.send(OP_FRAME, {
      cmd: "SET_ACTIVITY",
      args: { pid: process.pid, activity: this.pending ?? undefined },
      nonce: randomUUID(),
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.drop();
    this.destroyed = true; // drop() may have re-cleared; keep terminal
  }
}
