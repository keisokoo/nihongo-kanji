import { db } from "./db";
import { isJlptLevel, type Pack, type PackKind } from "./types";
import { parseSentence } from "../sentence";

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
  meaningsKo?: string[];
  examples?: SeedExample[];
};

export type SeedKanji = {
  character: string;
  meaningKo: string;
  strokeCount?: number | null;
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

function validateImport(
  input: PackImportInput,
  allowJlpt: boolean,
): { key: string; title: string; kind: PackKind } {
  const title = input.title?.trim();
  if (!title) throw new Error("title is required");

  const explicitKey = input.key?.trim();
  const derivedKey = slugify(title) || slugify(explicitKey ?? "") || "pack";
  const key = explicitKey || derivedKey;

  const isJlptKey = isJlptLevel(key) || isJlptLevel(title);
  const kind: PackKind = input.kind ?? (isJlptKey ? "jlpt" : "custom");

  if (kind === "jlpt" && !allowJlpt) {
    throw new Error(
      `JLPT 키 (${key}) 는 시스템 예약어입니다. 커스텀 팩은 N1-N5 가 아닌 다른 이름을 사용하세요.`,
    );
  }
  if (kind === "custom" && isJlptKey) {
    throw new Error(`커스텀 팩의 제목/키는 N1-N5 가 될 수 없습니다.`);
  }
  if (kind === "jlpt" && !isJlptKey) {
    throw new Error(
      `kind=jlpt 인 경우 key 는 N1-N5 중 하나여야 합니다 (받은 값: ${key})`,
    );
  }

  return { key, title, kind };
}

/**
 * Replace-style import — the same shape as the previous server importPack.
 * Each kanji entry overwrites any existing kanji with the same (packKey, character).
 *
 * Wrapped in a Dexie transaction for atomicity.
 */
export async function importPack(
  input: PackImportInput,
  opts: { allowJlpt: boolean } = { allowJlpt: false },
): Promise<ImportResult> {
  if (!Array.isArray(input.kanji)) {
    throw new Error("kanji array is required");
  }

  const { key, title, kind } = validateImport(input, opts.allowJlpt);
  const stats: ImportStats = { kanji: 0, readings: 0, words: 0, examples: 0 };

  const d = db();
  let resultPack!: Pack;

  await d.transaction(
    "rw",
    [d.packs, d.kanji, d.readings, d.words, d.examples],
    async () => {
      // Upsert pack
      const existing = await d.packs.get(key);
      if (existing) {
        if (existing.kind !== kind) {
          throw new Error(
            `key "${key}" is already a ${existing.kind} pack — cannot change kind`,
          );
        }
        const updated: Pack = {
          ...existing,
          title,
          description: input.description ?? existing.description,
        };
        await d.packs.put(updated);
        resultPack = updated;
      } else {
        const created: Pack = {
          key,
          title,
          kind,
          description: input.description ?? null,
          createdAt: new Date(),
        };
        await d.packs.put(created);
        resultPack = created;
      }

      for (const entry of input.kanji) {
        // Replace existing kanji with this character in this pack.
        const existingKanji = await d.kanji
          .where("[packKey+character]")
          .equals([key, entry.character])
          .first();
        if (existingKanji) {
          // Cascade: collect dependent ids, then delete.
          const oldKanjiId = existingKanji.id;
          const oldWords = await d.words
            .where("kanjiId")
            .equals(oldKanjiId)
            .toArray();
          const oldWordIds = oldWords.map((w) => w.id);
          if (oldWordIds.length > 0) {
            await d.examples.where("wordId").anyOf(oldWordIds).delete();
          }
          await d.words.where("kanjiId").equals(oldKanjiId).delete();
          await d.readings.where("kanjiId").equals(oldKanjiId).delete();
          await d.kanji.delete(oldKanjiId);
        }

        const kanjiId = (await d.kanji.add({
          packKey: key,
          character: entry.character,
          meaningKo: entry.meaningKo,
          strokeCount: entry.strokeCount ?? null,
          createdAt: new Date(),
        } as Omit<Parameters<typeof d.kanji.add>[0], "id"> as never)) as number;
        stats.kanji++;

        if (!entry.readings || entry.readings.length === 0) continue;

        const readingByText = new Map<string, number>();
        for (const r of entry.readings) {
          const id = (await d.readings.add({
            kanjiId,
            type: r.type,
            reading: r.reading,
            romaji: r.romaji ?? null,
          } as never)) as number;
          readingByText.set(r.reading, id);
          stats.readings++;
        }

        for (const w of entry.words ?? []) {
          const readingId = readingByText.get(w.readingRef);
          if (readingId === undefined) {
            console.warn(
              `  ! skip word ${entry.character}/${w.word}: readingRef "${w.readingRef}" not in readings`,
            );
            continue;
          }
          const wordId = (await d.words.add({
            kanjiId,
            readingId,
            word: w.word,
            wordReading: w.wordReading,
            meaningsKo: w.meaningsKo ?? [],
            source: "seed",
            createdAt: new Date(),
            explanation: null,
          } as never)) as number;
          stats.words++;

          for (const ex of w.examples ?? []) {
            await d.examples.add({
              wordId,
              sentence: parseSentence(
                ex.sentence,
                `${entry.character} / ${w.word}`,
              ),
              sentenceTranslationKo: ex.sentenceTranslationKo ?? null,
              source: "seed",
              createdAt: new Date(),
              explanation: null,
            } as never);
            stats.examples++;
          }
        }
      }
    },
  );

  return { pack: resultPack, stats };
}
