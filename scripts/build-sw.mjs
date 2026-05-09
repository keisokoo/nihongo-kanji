#!/usr/bin/env node
/**
 * Post-build SW generator. Runs after `react-router build` because vite-plugin-pwa's
 * own SW step gets clobbered by RR7's dual vite passes.
 *
 * Strategy:
 * 1. workbox-build's `injectManifest` compiles app/sw.ts → build/client/sw.js,
 *    injecting the precache list from the assets in build/client/.
 * 2. The result is a self-contained SW that precaches the app shell + the
 *    bundled seed JSONs and runtime-caches Google Fonts.
 */
import { injectManifest } from "workbox-build";
import { build as viteBuild } from "vite";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";

const ROOT = resolve(process.cwd());
const CLIENT_DIR = resolve(ROOT, "build/client");
const SW_SRC = resolve(ROOT, "app/sw.ts");
const SW_TMP = resolve(ROOT, "build/.sw/sw.js");
const SW_OUT = resolve(CLIENT_DIR, "sw.js");

// 1. Compile app/sw.ts → an intermediate sw.js using vite (for workbox imports).
console.log("[build-sw] compiling app/sw.ts …");
await viteBuild({
  configFile: false,
  root: ROOT,
  // Avoid clobbering build/client.
  build: {
    outDir: resolve(ROOT, "build/.sw"),
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    target: "es2020",
    rollupOptions: {
      input: SW_SRC,
      output: {
        entryFileNames: "sw.js",
        format: "es",
      },
    },
    lib: undefined,
  },
});

// 2. Inject the precache manifest into the compiled SW.
console.log("[build-sw] injecting precache manifest …");
const result = await injectManifest({
  swSrc: SW_TMP,
  swDest: SW_OUT,
  globDirectory: CLIENT_DIR,
  globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,json,wasm}"],
  // Seed JSONs are large.
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
});

console.log(
  `[build-sw] precached ${result.count} files (${(result.size / 1024).toFixed(1)} KiB) → ${SW_OUT}`,
);
if (result.warnings.length) {
  for (const w of result.warnings) console.warn("  warning:", w);
}

// 3. Clean up the intermediate.
await rm(resolve(ROOT, "build/.sw"), { recursive: true, force: true });
