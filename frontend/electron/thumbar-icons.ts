// Icons for the Windows taskbar thumbnail toolbar (prev / play / pause / next).
//
// Rather than ship PNG asset files (and wire them into the packager), we draw
// the four glyphs into RGBA buffers and encode them as PNGs at runtime with a
// tiny dependency-free encoder. They're plain white glyphs on transparency —
// Windows tints/scales them for the dark taskbar. Generated at 32px and tagged
// scaleFactor 2 so they stay crisp on HiDPI taskbars (logical size 16x16, which
// is what the thumbnail toolbar expects).

import { nativeImage, type NativeImage } from "electron";
import zlib from "node:zlib";

const SIZE = 32;

function blank(): Uint8Array {
  return new Uint8Array(SIZE * SIZE * 4);
}

// Paint an opaque white pixel (alpha is max-combined so overlapping fills don't
// darken). Out-of-bounds writes are ignored.
function set(buf: Uint8Array, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  buf[i] = 255;
  buf[i + 1] = 255;
  buf[i + 2] = 255;
  buf[i + 3] = 255;
}

function rect(buf: Uint8Array, x0: number, x1: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(buf, x, y);
}

// Right-pointing triangle: vertical base at x0, apex at (x1, mid).
function triRight(buf: Uint8Array, x0: number, x1: number, yTop: number, yBot: number): void {
  const mid = (yTop + yBot) / 2;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0);
    const top = Math.round(yTop + (mid - yTop) * t);
    const bot = Math.round(yBot - (yBot - mid) * t);
    for (let y = top; y <= bot; y++) set(buf, x, y);
  }
}

// Left-pointing triangle: apex at (x0, mid), vertical base at x1.
function triLeft(buf: Uint8Array, x0: number, x1: number, yTop: number, yBot: number): void {
  const mid = (yTop + yBot) / 2;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0);
    const top = Math.round(mid - (mid - yTop) * t);
    const bot = Math.round(mid + (yBot - mid) * t);
    for (let y = top; y <= bot; y++) set(buf, x, y);
  }
}

// ---- Minimal PNG encoder (8-bit RGBA, single uncompressed-filter IDAT) ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(rgba: Uint8Array): Buffer {
  const stride = SIZE * 4;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function make(draw: (b: Uint8Array) => void): NativeImage {
  const b = blank();
  draw(b);
  return nativeImage.createFromBuffer(encodePng(b), { scaleFactor: 2 });
}

export interface ThumbarIcons {
  prev: NativeImage;
  play: NativeImage;
  pause: NativeImage;
  next: NativeImage;
}

// nativeImage must be created lazily (after app is ready), so memoize on first
// use rather than at module load.
let cached: ThumbarIcons | null = null;

export function thumbarIcons(): ThumbarIcons {
  if (cached) return cached;
  cached = {
    play: make((b) => triRight(b, 10, 24, 6, 26)),
    pause: make((b) => {
      rect(b, 9, 13, 6, 26);
      rect(b, 19, 23, 6, 26);
    }),
    next: make((b) => {
      triRight(b, 7, 19, 7, 25);
      rect(b, 21, 24, 7, 25);
    }),
    prev: make((b) => {
      rect(b, 7, 10, 7, 25);
      triLeft(b, 12, 24, 7, 25);
    }),
  };
  return cached;
}
