// Builds the Electron desktop app and packages installers for the host OS.
//
// Pipeline:
//   1. vite build                       -> dist/ (the React SPA)
//   2. esbuild electron/main.ts          -> build/electron/main.cjs (one CJS file)
//   3. electron-builder                  -> release/ (NSIS on Windows, AppImage
//      on Linux), each for x64 + arm64
//
// The main bundle pulls in server/serve.ts and the whole /api handler, so the
// packaged app ships one main.cjs + the SPA in dist/ and needs no node_modules
// at runtime (electron itself excepted). Cross-OS builds come from the CI matrix
// (one job per OS); see .github/workflows/release.yml.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync, mkdirSync } from "node:fs";

const root = path.resolve(fileURLToPath(import.meta.url), "..", ".."); // frontend/
const buildDir = path.join(root, "build", "electron");

async function main() {
  rmSync(path.join(root, "build"), { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });

  // 1. Build the SPA via Vite's JS API (auto-loads vite.config.ts; skips tsc,
  //    which the packaged app doesn't need).
  console.log("\n[1/3] vite build");
  const { build: viteBuild } = await import("vite");
  await viteBuild({ root });

  // 2. Bundle the Electron main process into one CommonJS file.
  console.log("\n[2/3] esbuild electron main");
  const { build: esbuild } = await import("esbuild");
  await esbuild({
    entryPoints: [path.join(root, "electron", "main.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    outfile: path.join(buildDir, "main.cjs"),
    external: ["electron"],
    minify: true,
    legalComments: "none",
  });

  // 3. Package installers for the host OS, x64 + arm64. Config lives in
  //    package.json "build"; we only pick the targets/arches here.
  console.log("\n[3/3] electron-builder");
  const { build: ebuild, Platform, Arch } = await import("electron-builder");
  const targets =
    process.platform === "win32"
      ? Platform.WINDOWS.createTarget(["nsis"], Arch.x64, Arch.arm64)
      : Platform.LINUX.createTarget(["AppImage"], Arch.x64, Arch.arm64);
  await ebuild({ targets });

  console.log("\nDone -> release/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
