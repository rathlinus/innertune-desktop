// Builds single-file, self-contained executables using Node's official Single
// Executable Application (SEA) feature.
//
// Pipeline:
//   1. vite build                         -> dist/ (the React SPA)
//   2. esbuild server/standalone.ts       -> build/bundle.cjs (one CJS file)
//   3. node --experimental-sea-config     -> build/sea-prep.blob (code + SPA assets)
//   4. for each target arch: take a `node` binary of that arch + inject the blob
//      with postject -> release/ytmusicnative-<os>-<arch>
//
// The blob is architecture-independent (we disable code-cache/snapshot), and
// postject (LIEF-as-WASM) can inject into a binary of a different arch. So a
// single x64 runner builds both x64 and arm64 for its OS: the host arch reuses
// this very `node`; other arches download the matching official Node build.
//
// Targets are taken from TARGET_ARCHES (comma-separated, default = host arch),
// always for the host OS. Cross-OS builds come from the CI matrix (one job per
// OS); see .github/workflows/release.yml.

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(fileURLToPath(import.meta.url), "..", ".."); // frontend/
const distDir = path.join(root, "dist");
const buildDir = path.join(root, "build");
const releaseDir = path.join(root, "release");

const SENTINEL = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const isWin = process.platform === "win32";
const OS_LABEL =
  process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "macos"
      : "linux";

function sh(cmd, args, opts = {}) {
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
}

// esbuild + postject are build-only tools we don't want in the committed
// lockfile; install them on demand if they aren't already present.
function ensureBuildTools() {
  try {
    require.resolve("esbuild");
    require.resolve("postject");
  } catch {
    console.log("Installing build tools (esbuild, postject)...");
    const npm = isWin ? "npm.cmd" : "npm";
    // Node 20+ refuses to spawn .cmd/.bat without a shell on Windows.
    sh(npm, ["install", "--no-save", "esbuild", "postject"], { shell: isWin });
  }
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (statSync(fp).isDirectory()) out.push(...walk(fp));
    else out.push(fp);
  }
  return out;
}

async function download(url, dest) {
  console.log(`  fetch ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// Path to a `node` binary of the given arch for the host OS. The host arch reuses
// the running node; any other arch is downloaded from nodejs.org (matching this
// node's exact version) and cached under build/.
async function nodeBinaryFor(arch) {
  if (arch === process.arch) return process.execPath;

  const version = process.versions.node; // pin to the host's version
  const dl = path.join(buildDir, "node-dl");
  mkdirSync(dl, { recursive: true });

  if (isWin) {
    const name = `node-v${version}-win-${arch}`;
    const exe = path.join(dl, name, "node.exe");
    if (!existsSync(exe)) {
      const zip = path.join(dl, `${name}.zip`);
      await download(`https://nodejs.org/dist/v${version}/${name}.zip`, zip);
      // Windows ships bsdtar; PowerShell's Expand-Archive is the safe default.
      sh("powershell", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Force -Path '${zip}' -DestinationPath '${dl}'`,
      ]);
    }
    return exe;
  }

  const name = `node-v${version}-${OS_LABEL}-${arch}`;
  const bin = path.join(dl, name, "bin", "node");
  if (!existsSync(bin)) {
    const tarball = path.join(dl, `${name}.tar.xz`);
    await download(`https://nodejs.org/dist/v${version}/${name}.tar.xz`, tarball);
    sh("tar", ["-xJf", tarball, "-C", dl]);
  }
  return bin;
}

async function buildBinary(arch, blob, postject) {
  const nodeBin = await nodeBinaryFor(arch);
  const outName = `ytmusicnative-${OS_LABEL}-${arch}${isWin ? ".exe" : ""}`;
  const outBin = path.join(releaseDir, outName);
  cpSync(nodeBin, outBin);

  const opts = { sentinelFuse: SENTINEL };
  if (process.platform === "darwin") opts.machoSegmentName = "NODE_SEA";
  await postject.inject(outBin, "NODE_SEA_BLOB", blob, opts);
  if (!isWin) chmodSync(outBin, 0o755);

  console.log(`  ✓ ${path.relative(process.cwd(), outBin)}`);
}

async function main() {
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(releaseDir, { recursive: true });
  ensureBuildTools();

  // 1. Build the SPA via Vite's JS API (auto-loads vite.config.ts; skips tsc,
  //    which the binary doesn't need).
  console.log("\n[1/4] vite build");
  const { build: viteBuild } = await import("vite");
  await viteBuild({ root });

  // 2. Bundle the standalone server into one CommonJS file (SEA needs CJS).
  console.log("\n[2/4] esbuild server bundle");
  const { build } = await import("esbuild");
  const bundlePath = path.join(buildDir, "bundle.cjs");
  await build({
    entryPoints: [path.join(root, "server", "standalone.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    outfile: bundlePath,
    minify: true,
    legalComments: "none",
  });

  // 3. Generate the SEA blob, embedding every built asset so the binary is
  //    fully self-contained (no dist/ folder needed next to it at runtime).
  console.log("\n[3/4] SEA blob");
  const assets = {};
  for (const fp of walk(distDir)) {
    assets[path.relative(distDir, fp).split(path.sep).join("/")] = fp;
  }
  const blobPath = path.join(buildDir, "sea-prep.blob");
  const seaConfigPath = path.join(buildDir, "sea-config.json");
  writeFileSync(
    seaConfigPath,
    JSON.stringify(
      {
        main: bundlePath,
        output: blobPath,
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: false,
        assets,
      },
      null,
      2
    )
  );
  sh(process.execPath, ["--experimental-sea-config", seaConfigPath]);

  // 4. Produce a binary per target arch (host arch + any cross targets).
  console.log("\n[4/4] inject into binaries");
  const postject =
    (await import("postject")).default ?? (await import("postject"));
  const blob = readFileSync(blobPath);
  const arches = (process.env.TARGET_ARCHES || process.arch)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const arch of arches) await buildBinary(arch, blob, postject);

  console.log(`\nDone -> ${path.relative(process.cwd(), releaseDir)}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
