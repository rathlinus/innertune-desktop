import { resolveAuthedAudio, resolvePremiumAudio } from "./server/premium";
async function check(label: string, r: { itag: number; url: string; contentLength?: string }) {
  const clen = Number(r.contentLength);
  for (const range of ["bytes=0-", `bytes=${clen - 100000}-${clen - 1}`, "bytes=2097152-3145727"]) {
    const res = await fetch(r.url, { headers: { Range: range } });
    console.log(label.padEnd(16), "itag", r.itag, range.padEnd(24), "->", res.status, res.headers.get("content-range"));
    await res.body?.cancel().catch(() => {});
  }
  const full = await fetch(r.url);
  const buf = await full.arrayBuffer();
  console.log(label.padEnd(16), "full GET ->", full.status, buf.byteLength, "of", clen, buf.byteLength === clen ? "COMPLETE" : "TRUNCATED");
}
async function main() {
  await check("authed lo", await resolveAuthedAudio("JZN65HtfVno", false));
  await check("premium hq", await resolvePremiumAudio("JZN65HtfVno"));
}
main();
