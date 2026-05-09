#!/usr/bin/env node
/**
 * Sync the canonical seed JSONs from scripts/data/ → public/seed/, and
 * regenerate public/seed/manifest.json with stats. Run after editing the
 * source files (e.g. via the AI fill flow in scripts/data/AI_FILL_PROMPT.md).
 */
import { readFile, writeFile, mkdir, copyFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC_DIR = resolve(ROOT, "scripts/data");
const OUT_DIR = resolve(ROOT, "public/seed");

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

await mkdir(OUT_DIR, { recursive: true });

const files = [];
for (const level of LEVELS) {
  const src = resolve(SRC_DIR, `${level.toLowerCase()}.json`);
  const dst = resolve(OUT_DIR, `${level.toLowerCase()}.json`);
  await copyFile(src, dst);

  const text = await readFile(dst, "utf-8");
  const data = JSON.parse(text);
  const kanji = data.kanji.length;
  let words = 0;
  let examples = 0;
  for (const k of data.kanji) {
    const ws = k.words ?? [];
    words += ws.length;
    for (const w of ws) examples += (w.examples ?? []).length;
  }
  const { size } = await stat(dst);
  files.push({
    level,
    path: `/seed/${level.toLowerCase()}.json`,
    kanji,
    words,
    examples,
    bytes: size,
  });
  console.log(
    `  ${level}: ${kanji} kanji / ${words} words / ${examples} examples (${(size / 1024).toFixed(1)} KiB)`,
  );
}

const manifest = { version: 1, files };
await writeFile(
  resolve(OUT_DIR, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf-8",
);
console.log(
  `\nWrote ${OUT_DIR}/manifest.json (${files.length} files, ${(
    files.reduce((n, f) => n + f.bytes, 0) / 1024
  ).toFixed(0)} KiB total)`,
);
