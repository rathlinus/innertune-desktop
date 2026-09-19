// Update the Innertune installed on this PC to the current source, and restart it.
//
//   npm run update:local                 build + install + restart
//   npm run update:local -- --skip-build reinstall the last built installer
//
// Pipeline (Windows):
//   1. build-electron.mjs --arch=<this PC's arch> -> release/<Product> Setup <ver>.exe
//      (only the host arch, so it's roughly half the time of a release build)
//   2. note where the running app lives, then force-quit it — a plain close
//      only hides it to the tray (see electron/main.ts), and the installer can't
//      replace files that are in use
//   3. run the NSIS installer silently (/S); it reuses the existing install dir
//   4. relaunch the app, detached, with ELECTRON_RUN_AS_NODE removed from the
//      environment — when this runs from a VS Code terminal that variable is
//      inherited and would start Innertune.exe as plain Node ("bad option").

import { spawn, spawnSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(import.meta.url), "..", ".."); // frontend/
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const product = pkg.build?.productName || pkg.name;
const exeName = `${product}.exe`;
const skipBuild = process.argv.includes("--skip-build");

function fail(msg) {
  console.error(`\n[update] ${msg}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Full path of the running app's executable, or null if it isn't running.
function runningExePath() {
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-Process -Name '${product}' -ErrorAction SilentlyContinue | Select-Object -First 1).Path`,
      ],
      { encoding: "utf8" }
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

function isRunning() {
  const out = spawnSync("tasklist", ["/FI", `IMAGENAME eq ${exeName}`, "/NH"], {
    encoding: "utf8",
  }).stdout;
  return (out || "").toLowerCase().includes(exeName.toLowerCase());
}

async function stopApp() {
  if (!isRunning()) return;
  console.log(`[update] stopping ${product}`);
  spawnSync("taskkill", ["/IM", exeName, "/F", "/T"], { stdio: "ignore" });
  for (let i = 0; i < 50 && isRunning(); i++) await sleep(200);
  if (isRunning()) fail(`${product} is still running - close it and try again`);
  await sleep(500); // let Windows release the file handles
}

// Remove the previous installer before building. makensis overwrites it in
// place and fails with "Can't open output file" if anything still has it open —
// typically Windows Defender scanning it right after the last build/install.
// Such locks are brief, so wait them out instead of failing the whole build.
async function removeOldInstaller(file) {
  for (let i = 0; i < 20; i++) {
    try {
      rmSync(file, { force: true });
      return;
    } catch {
      await sleep(500);
    }
  }
  fail(`${path.basename(file)} is locked by another program - close it and try again`);
}

function build() {
  return spawnSync(
    process.execPath,
    [path.join(root, "scripts", "build-electron.mjs"), `--arch=${process.arch}`],
    { cwd: root, stdio: "inherit" }
  ).status;
}

async function main() {
  if (process.platform !== "win32") fail("only Windows (NSIS) installs are supported");

  const installer = path.join(root, "release", `${product} Setup ${pkg.version}.exe`);

  // 1. Build. One retry: a scanner can also grab the freshly written
  //    uninstaller/installer mid-build, which fails the same way and passes on
  //    a second attempt.
  if (!skipBuild) {
    console.log(`[update] building ${product} ${pkg.version} (${process.arch})`);
    await removeOldInstaller(installer);
    if (build() !== 0) {
      console.log("\n[update] build failed - retrying once in 3 s");
      await sleep(3000);
      await removeOldInstaller(installer);
      if (build() !== 0) fail("build failed - the installed app was left untouched");
    }
  }
  if (!existsSync(installer)) fail(`installer not found: ${installer}`);

  // 2. Stop the running app (remembering where it's installed).
  const defaultExe = path.join(process.env.LOCALAPPDATA || "", "Programs", product, exeName);
  const exe = runningExePath() || defaultExe;
  await stopApp();

  // 3. Silent install over the existing copy.
  console.log(`[update] installing ${path.basename(installer)}`);
  const inst = spawnSync(installer, ["/S"], { stdio: "inherit" });
  if (inst.status !== 0) fail(`installer exited with code ${inst.status}`);

  // 4. Relaunch, detached, without ELECTRON_RUN_AS_NODE.
  if (!existsSync(exe)) fail(`installed but can't find ${exe} to restart it`);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(exe, [], { detached: true, stdio: "ignore", env }).unref();
  console.log(`[update] ${product} ${pkg.version} installed and restarted (${exe})`);
}

main().catch((e) => fail(e?.stack || String(e)));
