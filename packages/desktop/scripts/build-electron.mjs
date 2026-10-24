/**
 * esbuild bundler for the Electron main process and preload script.
 *
 * Both artifacts are emitted as **CommonJS** (`.cjs`):
 *   - a sandboxed renderer requires a CommonJS preload script;
 *   - a CommonJS main process avoids the ESM `app.whenReady()` pitfalls.
 *
 * Usage:
 *   node scripts/build-electron.mjs           # one-shot build
 *   node scripts/build-electron.mjs --watch   # rebuild on change
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build, context } from "esbuild";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const outDir = path.join(packageRoot, "dist", "electron");

const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
};

const targets = [
  {
    entryPoints: [path.join(packageRoot, "src", "electron", "main.ts")],
    outfile: path.join(outDir, "main.cjs"),
  },
  {
    entryPoints: [path.join(packageRoot, "src", "electron", "preload.ts")],
    outfile: path.join(outDir, "preload.cjs"),
  },
];

if (watch) {
  const contexts = await Promise.all(
    targets.map((target) => context({ ...common, ...target })),
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.info("[desktop] watching electron sources ...");
} else {
  await rm(outDir, { recursive: true, force: true });
  await Promise.all(targets.map((target) => build({ ...common, ...target })));
  console.info(`[desktop] built ${targets.length} artifacts into ${outDir}`);
}
