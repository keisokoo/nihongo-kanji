#!/usr/bin/env node
/**
 * Sync the canonical seed JSONs from scripts/data/ → public/seed/, and
 * regenerate public/seed/manifest.json with stats. Run after editing the
 * source files (e.g. via the AI fill flow in scripts/data/AI_FILL_PROMPT.md
 * or GRAMMAR_FILL_PROMPT.md).
 */
import { access, readFile, writeFile, mkdir, copyFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC_DIR = resolve(ROOT, "scripts/data");
const OUT_DIR = resolve(ROOT, "public/seed");

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

await mkdir(OUT_DIR, { recursive: true });

// 한자팩
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

// 문법팩 (있는 레벨만 포함 — 채워진 항목이 1개라도 있어야 manifest 등재)
const grammar = [];
for (const level of LEVELS) {
  const src = resolve(SRC_DIR, `grammar-${level.toLowerCase()}.json`);
  try {
    await access(src);
  } catch {
    continue; // 없으면 skip
  }
  const text = await readFile(src, "utf-8");
  const data = JSON.parse(text);
  const filledItems = (data.items ?? []).filter(
    (i) => (i.explanation ?? "").length > 0,
  );
  if (filledItems.length === 0) {
    console.log(`  grammar ${level}: 0 filled items — skipping manifest entry`);
    continue;
  }
  const dst = resolve(OUT_DIR, `grammar-${level.toLowerCase()}.json`);
  // 채워진 항목만 publish (빈 shell 은 시드에 안 들어감)
  const published = { ...data, items: filledItems };
  await writeFile(dst, JSON.stringify(published, null, 2) + "\n", "utf-8");

  let examples = 0;
  let quizzes = 0;
  for (const it of filledItems) {
    examples += (it.examples ?? []).length;
    quizzes += (it.quizzes ?? []).length;
  }
  const { size } = await stat(dst);
  grammar.push({
    level,
    path: `/seed/grammar-${level.toLowerCase()}.json`,
    items: filledItems.length,
    examples,
    quizzes,
    bytes: size,
  });
  console.log(
    `  grammar ${level}: ${filledItems.length} items / ${examples} examples / ${quizzes} quizzes (${(size / 1024).toFixed(1)} KiB)`,
  );
}

const manifest = { version: grammar.length > 0 ? 2 : 1, files };
if (grammar.length > 0) manifest.grammar = grammar;
await writeFile(
  resolve(OUT_DIR, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf-8",
);
const totalBytes =
  files.reduce((n, f) => n + f.bytes, 0) +
  grammar.reduce((n, f) => n + f.bytes, 0);
console.log(
  `\nWrote ${OUT_DIR}/manifest.json (${files.length} kanji + ${grammar.length} grammar files, ${(
    totalBytes / 1024
  ).toFixed(0)} KiB total)`,
);
