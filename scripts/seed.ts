import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { importPack, type PackImportInput } from "../app/lib/pack.server";

/**
 * Legacy {level, kanji} shape (n5.json) — auto-converted to the new shape.
 */
type LegacyShape = {
  level: string;
  kanji: PackImportInput["kanji"];
};

type CurrentShape = PackImportInput;

async function load(path: string): Promise<PackImportInput> {
  const raw = await readFile(path, "utf-8");
  const data = JSON.parse(raw) as CurrentShape | LegacyShape;

  if ("level" in data && typeof data.level === "string" && Array.isArray(data.kanji)) {
    return {
      key: data.level,
      title: data.level,
      kind: "jlpt",
      kanji: data.kanji,
    };
  }
  const cur = data as CurrentShape;
  if (!cur.title || !Array.isArray(cur.kanji)) {
    throw new Error(`invalid seed file: ${path}`);
  }
  return cur;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: tsx scripts/seed.ts <path-to-json>");
    process.exit(1);
  }
  const path = resolve(process.cwd(), arg);
  const input = await load(path);

  console.log(
    `seeding ${input.kanji.length} kanji into pack "${input.title}" (key=${input.key ?? "auto"}, kind=${input.kind ?? "auto"}) from ${path}`,
  );

  const { pack, stats } = await importPack(input, { allowJlpt: true });
  console.log(
    `done: pack ${pack.key} · ${stats.kanji} kanji, ${stats.readings} readings, ${stats.words} words, ${stats.examples} examples`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
