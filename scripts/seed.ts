import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db, kanji, readings, words, examples } from "../app/lib/db";
import { parseSentence } from "../app/lib/sentence";

type SeedReading = { type: "on" | "kun"; reading: string; romaji?: string };

type SeedExample = {
  sentence: string;
  sentenceTranslationKo?: string;
};

type SeedWord = {
  readingRef: string;
  word: string;
  wordReading: string;
  examples?: SeedExample[];
};

type SeedKanji = {
  character: string;
  meaningKo: string;
  strokeCount?: number;
  readings: SeedReading[];
  words: SeedWord[];
};

type SeedFile = {
  level: "N5" | "N4" | "N3";
  kanji: SeedKanji[];
};

async function loadSeed(path: string): Promise<SeedFile> {
  const raw = await readFile(path, "utf-8");
  const data = JSON.parse(raw) as SeedFile;
  if (!data.level || !Array.isArray(data.kanji)) {
    throw new Error(`invalid seed file: ${path}`);
  }
  return data;
}

async function seedKanji(level: SeedFile["level"], entry: SeedKanji) {
  await db.delete(kanji).where(eq(kanji.character, entry.character));

  const [k] = await db
    .insert(kanji)
    .values({
      character: entry.character,
      level,
      meaningKo: entry.meaningKo,
      strokeCount: entry.strokeCount,
    })
    .returning();

  if (entry.readings.length === 0) {
    return { kanjiId: k.id, readings: 0, words: 0, examples: 0 };
  }

  const insertedReadings = await db
    .insert(readings)
    .values(
      entry.readings.map((r) => ({
        kanjiId: k.id,
        type: r.type,
        reading: r.reading,
        romaji: r.romaji,
      })),
    )
    .returning();

  const readingByText = new Map(insertedReadings.map((r) => [r.reading, r]));

  let totalWords = 0;
  let totalExamples = 0;

  for (const w of entry.words ?? []) {
    const r = readingByText.get(w.readingRef);
    if (!r) {
      console.warn(
        `  ! skip word ${entry.character}/${w.word}: readingRef "${w.readingRef}" not in readings`,
      );
      continue;
    }
    const [insertedWord] = await db
      .insert(words)
      .values({
        kanjiId: k.id,
        readingId: r.id,
        word: w.word,
        wordReading: w.wordReading,
      })
      .returning();
    totalWords++;

    if (w.examples && w.examples.length > 0) {
      const exampleRows = w.examples.map((ex) => ({
        wordId: insertedWord.id,
        sentence: parseSentence(ex.sentence, `${entry.character} / ${w.word}`),
        sentenceTranslationKo: ex.sentenceTranslationKo,
        source: "seed" as const,
      }));
      await db.insert(examples).values(exampleRows);
      totalExamples += exampleRows.length;
    }
  }

  return {
    kanjiId: k.id,
    readings: insertedReadings.length,
    words: totalWords,
    examples: totalExamples,
  };
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: tsx scripts/seed.ts <path-to-json>");
    process.exit(1);
  }
  const path = resolve(process.cwd(), arg);
  const file = await loadSeed(path);

  console.log(`seeding ${file.kanji.length} ${file.level} kanji from ${path}`);
  let totals = { readings: 0, words: 0, examples: 0 };
  for (const entry of file.kanji) {
    const r = await seedKanji(file.level, entry);
    totals.readings += r.readings;
    totals.words += r.words;
    totals.examples += r.examples;
    console.log(
      `  ✓ ${entry.character}  (${r.readings}r / ${r.words}w / ${r.examples}ex)`,
    );
  }
  console.log(
    `done: ${file.kanji.length} kanji, ${totals.readings} readings, ${totals.words} words, ${totals.examples} examples`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
