import { db } from "./db";
import type { Example, Reading, Word } from "./types";
import { parseSentence, tokensToMarkdown } from "../sentence";
import type { ExportWord, PackExport } from "./pack-export";

export type DeltaImportMode = "replace" | "merge";

export type DeltaImportResult = {
  packKey: string;
  mode: DeltaImportMode;
  insertedWords: number;
  insertedExamples: number;
  attachedWordExplanations: number;
  attachedExampleExplanations: number;
  skippedWords: number;
  unknownKanji: string[];
  warnings: string[];
};

export async function importJlptDelta(
  input: PackExport,
  mode: DeltaImportMode,
): Promise<DeltaImportResult> {
  if (input.kind !== "jlpt-delta") {
    throw new Error(`expected jlpt-delta, got ${input.kind}`);
  }

  const d = db();
  const pack = await d.packs.get(input.key);
  if (!pack) {
    throw new Error(`pack not found: ${input.key} — seed it first`);
  }
  if (pack.kind !== "jlpt") {
    throw new Error(`pack ${input.key} is not a JLPT pack`);
  }

  const result: DeltaImportResult = {
    packKey: input.key,
    mode,
    insertedWords: 0,
    insertedExamples: 0,
    attachedWordExplanations: 0,
    attachedExampleExplanations: 0,
    skippedWords: 0,
    unknownKanji: [],
    warnings: [],
  };

  const packKanji = await d.kanji.where("packKey").equals(input.key).toArray();
  const kanjiByChar = new Map(packKanji.map((k) => [k.character, k]));
  const kanjiIds = packKanji.map((k) => k.id);

  await d.transaction(
    "rw",
    [d.packs, d.kanji, d.readings, d.words, d.examples],
    async () => {
      if (mode === "replace") {
        // Wipe AI-generated words (cascade their examples).
        if (kanjiIds.length > 0) {
          const aiWords = await d.words
            .where("kanjiId")
            .anyOf(kanjiIds)
            .filter((w) => w.source === "generated")
            .toArray();
          const aiWordIds = aiWords.map((w) => w.id);
          if (aiWordIds.length > 0) {
            await d.examples.where("wordId").anyOf(aiWordIds).delete();
            await d.words.bulkDelete(aiWordIds);
          }

          // Clear explanations on remaining (seed) words/examples in this pack.
          const seedWords = await d.words
            .where("kanjiId")
            .anyOf(kanjiIds)
            .toArray();
          const seedWithExpl = seedWords.filter((w) => w.explanation !== null);
          for (const w of seedWithExpl) {
            await d.words.update(w.id, { explanation: null });
          }
          const seedWordIds = seedWords.map((w) => w.id);
          if (seedWordIds.length > 0) {
            const seedExamples = await d.examples
              .where("wordId")
              .anyOf(seedWordIds)
              .toArray();
            for (const e of seedExamples) {
              if (e.explanation) {
                await d.examples.update(e.id, { explanation: null });
              }
            }
          }
        }
      }

      for (const item of input.items) {
        const k = kanjiByChar.get(item.kanjiCharacter);
        if (!k) {
          result.unknownKanji.push(item.kanjiCharacter);
          continue;
        }
        const readings = await d.readings
          .where("kanjiId")
          .equals(k.id)
          .toArray();
        const readingByText = new Map(readings.map((r) => [r.reading, r]));

        for (const w of item.words) {
          if (w.source === "generated") {
            await applyGeneratedWord(d, k.id, w, readingByText, mode, result);
          } else {
            await applySeedWordExtras(d, k.id, k.character, w, mode, result);
          }
        }
      }
    },
  );

  return result;
}

async function applyGeneratedWord(
  d: ReturnType<typeof db>,
  kanjiId: number,
  w: ExportWord,
  readingByText: Map<string, Reading>,
  mode: DeltaImportMode,
  result: DeltaImportResult,
) {
  if (mode === "merge") {
    const existing = await d.words
      .where("[kanjiId+word+wordReading]")
      .equals([kanjiId, w.word, w.wordReading])
      .first();
    if (existing) {
      result.skippedWords++;
      return;
    }
  }

  const matchedReading = w.readingRef
    ? readingByText.get(w.readingRef)
    : undefined;

  const wordId = (await d.words.add({
    kanjiId,
    readingId: matchedReading?.id ?? null,
    word: w.word,
    wordReading: w.wordReading,
    meaningsKo: w.meaningsKo,
    source: "generated",
    createdAt: new Date(),
    explanation: w.explanation,
  } as never)) as number;
  result.insertedWords++;
  if (w.explanation) result.attachedWordExplanations++;

  for (const ex of w.examples) {
    let tokens;
    try {
      tokens = parseSentence(
        ex.sentence,
        `delta-import gen ${w.word}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.warnings.push(`parse failed: ${w.word}: ${message}`);
      continue;
    }
    await d.examples.add({
      wordId,
      sentence: tokens,
      sentenceTranslationKo: ex.sentenceTranslationKo,
      source: ex.source,
      createdAt: new Date(),
      explanation: ex.explanation,
    } as never);
    result.insertedExamples++;
    if (ex.explanation) result.attachedExampleExplanations++;
  }
}

async function applySeedWordExtras(
  d: ReturnType<typeof db>,
  kanjiId: number,
  kanjiCharacter: string,
  w: ExportWord,
  mode: DeltaImportMode,
  result: DeltaImportResult,
) {
  const existing = await d.words
    .where("[kanjiId+word+wordReading]")
    .equals([kanjiId, w.word, w.wordReading])
    .first();
  if (!existing) {
    result.warnings.push(
      `seed word not found: ${kanjiCharacter}/${w.word} (${w.wordReading})`,
    );
    return;
  }

  // Word-level explanation
  if (w.explanation) {
    if (mode === "replace" || existing.explanation === null) {
      await d.words.update(existing.id, { explanation: w.explanation });
      result.attachedWordExplanations++;
    }
  }

  // Examples
  const existingExamples = await d.examples
    .where("wordId")
    .equals(existing.id)
    .toArray();
  const existingByMd = new Map<string, Example>(
    existingExamples.map((e) => [tokensToMarkdown(e.sentence), e]),
  );

  for (const ex of w.examples) {
    if (ex.source === "generated") {
      if (mode === "merge" && existingByMd.has(ex.sentence)) continue;
      let tokens;
      try {
        tokens = parseSentence(
          ex.sentence,
          `delta-import seed ${w.word}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.warnings.push(`parse failed: ${w.word}: ${message}`);
        continue;
      }
      await d.examples.add({
        wordId: existing.id,
        sentence: tokens,
        sentenceTranslationKo: ex.sentenceTranslationKo,
        source: "generated",
        createdAt: new Date(),
        explanation: ex.explanation,
      } as never);
      result.insertedExamples++;
      if (ex.explanation) result.attachedExampleExplanations++;
    } else {
      // seed-source example: attach explanation to matching existing
      const match = existingByMd.get(ex.sentence);
      if (!match) {
        result.warnings.push(
          `seed example not matched: ${kanjiCharacter}/${w.word}: ${ex.sentence.slice(0, 40)}…`,
        );
        continue;
      }
      if (ex.explanation) {
        if (mode === "replace" || match.explanation === null) {
          await d.examples.update(match.id, { explanation: ex.explanation });
          result.attachedExampleExplanations++;
        }
      }
    }
  }
}

// Re-export type for consumers
export type { PackExport };

// Helper consumed by Word-only fields used for Word type — re-export
export type { Word };
