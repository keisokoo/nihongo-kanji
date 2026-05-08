import { and, eq } from "drizzle-orm";
import {
  db,
  examples as examplesTable,
  kanji as kanjiTable,
  packs as packsTable,
  readings as readingsTable,
  words as wordsTable,
  type Pack,
  type PackKind,
  isJlptLevel,
} from "./db";
import { parseSentence } from "./sentence";

export type SeedReading = {
  type: "on" | "kun";
  reading: string;
  romaji?: string;
};

export type SeedExample = {
  sentence: string;
  sentenceTranslationKo?: string;
};

export type SeedWord = {
  readingRef: string;
  word: string;
  wordReading: string;
  examples?: SeedExample[];
};

export type SeedKanji = {
  character: string;
  meaningKo: string;
  strokeCount?: number;
  readings: SeedReading[];
  words: SeedWord[];
};

export type PackImportInput = {
  key?: string;
  title: string;
  kind?: PackKind;
  description?: string;
  kanji: SeedKanji[];
};

export type ImportStats = {
  kanji: number;
  readings: number;
  words: number;
  examples: number;
};

export type ImportResult = { pack: Pack; stats: ImportStats };

const SLUG_RE = /[^a-z0-9가-힣ぁ-んァ-ヶ一-龯-]+/g;

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(SLUG_RE, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function validateImport(input: PackImportInput, allowJlpt: boolean): {
  key: string;
  title: string;
  kind: PackKind;
} {
  const title = input.title?.trim();
  if (!title) throw new Error("title is required");

  const explicitKey = input.key?.trim();
  const derivedKey = slugify(title) || slugify(explicitKey ?? "") || "pack";
  const key = explicitKey || derivedKey;

  const isJlptKey = isJlptLevel(key) || isJlptLevel(title);
  const kind: PackKind =
    input.kind ?? (isJlptKey ? "jlpt" : "custom");

  if (kind === "jlpt" && !allowJlpt) {
    throw new Error(
      `JLPT 키 (${key}) 는 시스템 예약어입니다. 커스텀 팩는 N1-N5 가 아닌 다른 이름을 사용하세요.`,
    );
  }
  if (kind === "custom" && isJlptKey) {
    throw new Error(
      `커스텀 팩의 제목/키는 N1-N5 가 될 수 없습니다.`,
    );
  }
  if (kind === "jlpt" && !isJlptKey) {
    throw new Error(
      `kind=jlpt 인 경우 key 는 N1-N5 중 하나여야 합니다 (받은 값: ${key})`,
    );
  }

  return { key: key.toUpperCase() === key.toLowerCase() ? key : key, title, kind };
}

export async function importPack(
  input: PackImportInput,
  opts: { allowJlpt: boolean } = { allowJlpt: false },
): Promise<ImportResult> {
  if (!Array.isArray(input.kanji)) {
    throw new Error("kanji array is required");
  }

  const { key, title, kind } = validateImport(input, opts.allowJlpt);

  // Upsert the pack record.
  const existingPack = await db.query.packs.findFirst({
    where: eq(packsTable.key, key),
  });
  let pack: Pack;
  if (existingPack) {
    if (existingPack.kind !== kind) {
      throw new Error(
        `key "${key}" is already a ${existingPack.kind} pack — cannot change kind`,
      );
    }
    const [updated] = await db
      .update(packsTable)
      .set({
        title,
        description: input.description ?? existingPack.description,
      })
      .where(eq(packsTable.key, key))
      .returning();
    pack = updated;
  } else {
    const [created] = await db
      .insert(packsTable)
      .values({
        key,
        title,
        kind,
        description: input.description,
      })
      .returning();
    pack = created;
  }

  // Insert each kanji (replaces existing entries with the same character in this pack).
  const stats: ImportStats = { kanji: 0, readings: 0, words: 0, examples: 0 };

  for (const entry of input.kanji) {
    await db
      .delete(kanjiTable)
      .where(
        and(
          eq(kanjiTable.packKey, key),
          eq(kanjiTable.character, entry.character),
        ),
      );

    const [k] = await db
      .insert(kanjiTable)
      .values({
        packKey: key,
        character: entry.character,
        meaningKo: entry.meaningKo,
        strokeCount: entry.strokeCount,
      })
      .returning();
    stats.kanji++;

    if (!entry.readings || entry.readings.length === 0) continue;

    const insertedReadings = await db
      .insert(readingsTable)
      .values(
        entry.readings.map((r) => ({
          kanjiId: k.id,
          type: r.type,
          reading: r.reading,
          romaji: r.romaji,
        })),
      )
      .returning();
    stats.readings += insertedReadings.length;

    const readingByText = new Map(
      insertedReadings.map((r) => [r.reading, r]),
    );

    for (const w of entry.words ?? []) {
      const r = readingByText.get(w.readingRef);
      if (!r) {
        console.warn(
          `  ! skip word ${entry.character}/${w.word}: readingRef "${w.readingRef}" not in readings`,
        );
        continue;
      }
      const [insertedWord] = await db
        .insert(wordsTable)
        .values({
          kanjiId: k.id,
          readingId: r.id,
          word: w.word,
          wordReading: w.wordReading,
        })
        .returning();
      stats.words++;

      if (w.examples && w.examples.length > 0) {
        const rows = w.examples.map((ex) => ({
          wordId: insertedWord.id,
          sentence: parseSentence(
            ex.sentence,
            `${entry.character} / ${w.word}`,
          ),
          sentenceTranslationKo: ex.sentenceTranslationKo,
          source: "seed" as const,
        }));
        await db.insert(examplesTable).values(rows);
        stats.examples += rows.length;
      }
    }
  }

  return { pack, stats };
}
