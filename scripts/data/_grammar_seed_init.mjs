#!/usr/bin/env node
/**
 * grammar-{level}-raw.json (크롤러 산출물) → grammar-{level}.json (시드)
 * 빈 shell 을 만들어둠. 채우는 건 cowork 작업자 + _grammar_fill_merge.py.
 *
 * usage:
 *   node scripts/data/_grammar_seed_init.mjs N5
 *   node scripts/data/_grammar_seed_init.mjs N5 N4 N3 N2 N1
 *
 * SAFETY: 이미 채워진 항목 (explanation 또는 examples 또는 quizzes 가 비어있지 않음)
 *         이 1개라도 있으면 그 레벨은 건너뜀 — 작업한 데이터 보호.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const VALID = new Set(["N5", "N4", "N3", "N2", "N1"]);
const args = process.argv.slice(2).map((s) => s.toUpperCase());
const levels = args.filter((a) => VALID.has(a));
if (levels.length === 0) {
  console.error("usage: node _grammar_seed_init.mjs N5 [N4 N3 N2 N1]");
  process.exit(1);
}

for (const level of levels) {
  const slug = level.toLowerCase();
  const rawPath = resolve(HERE, `grammar-${slug}-raw.json`);
  const seedPath = resolve(HERE, `grammar-${slug}.json`);

  let existing = null;
  try {
    existing = JSON.parse(await readFile(seedPath, "utf-8"));
  } catch {
    // not yet created
  }

  if (existing) {
    const filled = (existing.items ?? []).filter(
      (i) =>
        (i.explanation && i.explanation.length > 0) ||
        (i.examples && i.examples.length > 0) ||
        (i.quizzes && i.quizzes.length > 0),
    ).length;
    if (filled > 0) {
      console.warn(
        `[${level}] ${seedPath} 이미 ${filled}개 채워짐 — 건너뜀 (덮어쓰지 않음)`,
      );
      continue;
    }
  }

  const raw = JSON.parse(await readFile(rawPath, "utf-8"));
  const items = raw.map((r) => ({
    no: r.no,
    pattern: r.pattern,
    romaji: r.romaji,
    ref: r.ref,
    refOriginalEn: r.meaningEn,

    // Cowork 가 채울 필드 (빈 값으로 시작)
    meaningsKo: [],
    category: null,
    explanation: "",
    formation: null,
    notes: null,
    applicableQuizTypes: [],
    examples: [],
    quizzes: [],
  }));

  const seed = {
    key: `${level}-grammar`,
    title: `${level} 문법`,
    kind: "jlpt-grammar",
    level,
    description: `JLPT ${level} 문법`,
    items,
  };

  await writeFile(seedPath, JSON.stringify(seed, null, 2) + "\n", "utf-8");
  console.log(`[${level}] → ${items.length} 항목 shell → ${seedPath}`);
}
