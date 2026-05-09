import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  examples as examplesTable,
  kanji as kanjiTable,
  packs as packsTable,
  readings as readingsTable,
  words as wordsTable,
} from "./db";
import { parseSentence, tokensToMarkdown } from "./sentence";
import type { ExportWord, PackExport } from "./pack-export.server";

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

/**
 * Apply a jlpt-delta export onto an existing JLPT pack.
 *
 * Modes:
 *   replace — wipe all AI-added content (generated words/examples + every
 *             explanation in the pack), then apply the import.
 *   merge   — keep existing AI content; only insert non-duplicate words/
 *             examples and only attach explanations where one isn't already
 *             present.
 */
export async function importJlptDelta(
  input: PackExport,
  mode: DeltaImportMode,
): Promise<DeltaImportResult> {
  if (input.kind !== "jlpt-delta") {
    throw new Error(`expected jlpt-delta, got ${input.kind}`);
  }

  const pack = await db.query.packs.findFirst({
    where: eq(packsTable.key, input.key),
  });
  if (!pack) {
    throw new Error(`pack not found: ${input.key} — seed it first`);
  }
  if (pack.kind !== "jlpt") {
    throw new Error(`pack ${input.key} is not a JLPT pack`);
  }

  const packKanji = await db.query.kanji.findMany({
    where: eq(kanjiTable.packKey, input.key),
  });
  const kanjiByChar = new Map(packKanji.map((k) => [k.character, k]));
  const kanjiIds = packKanji.map((k) => k.id);

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

  if (mode === "replace") {
    // Wipe AI-generated words (cascades to their examples).
    if (kanjiIds.length > 0) {
      await db
        .delete(wordsTable)
        .where(
          and(
            inArray(wordsTable.kanjiId, kanjiIds),
            eq(wordsTable.source, "generated"),
          ),
        );

      // Clear explanations on remaining (seed) words & examples in this pack.
      await db.execute(sql`
        UPDATE ${wordsTable}
        SET ${wordsTable.explanation} = NULL
        WHERE ${wordsTable.kanjiId} IN (${sql.join(
          kanjiIds.map((id) => sql`${id}`),
          sql`, `,
        )})
        AND ${wordsTable.explanation} IS NOT NULL
      `);

      await db.execute(sql`
        UPDATE ${examplesTable}
        SET ${examplesTable.explanation} = NULL
        WHERE ${examplesTable.wordId} IN (
          SELECT id FROM ${wordsTable}
          WHERE ${wordsTable.kanjiId} IN (${sql.join(
            kanjiIds.map((id) => sql`${id}`),
            sql`, `,
          )})
        )
        AND ${examplesTable.explanation} IS NOT NULL
      `);
    }
  }

  // Apply the import items.
  for (const item of input.items) {
    const k = kanjiByChar.get(item.kanjiCharacter);
    if (!k) {
      result.unknownKanji.push(item.kanjiCharacter);
      continue;
    }

    // Cache readings for this kanji (for readingRef → readingId lookup).
    const readings = await db.query.readings.findMany({
      where: eq(readingsTable.kanjiId, k.id),
    });
    const readingByText = new Map(readings.map((r) => [r.reading, r]));

    for (const w of item.words) {
      if (w.source === "generated") {
        await applyGeneratedWord(k, w, readingByText, mode, result);
      } else {
        await applySeedWordExtras(k, w, mode, result);
      }
    }
  }

  return result;
}

async function applyGeneratedWord(
  k: typeof kanjiTable.$inferSelect,
  w: ExportWord,
  readingByText: Map<string, typeof readingsTable.$inferSelect>,
  mode: DeltaImportMode,
  result: DeltaImportResult,
) {
  // Merge mode: skip if a word with same (kanjiId, word, wordReading) already exists.
  if (mode === "merge") {
    const existing = await db.query.words.findFirst({
      where: and(
        eq(wordsTable.kanjiId, k.id),
        eq(wordsTable.word, w.word),
        eq(wordsTable.wordReading, w.wordReading),
      ),
    });
    if (existing) {
      result.skippedWords++;
      return;
    }
  }

  const matchedReading = w.readingRef
    ? readingByText.get(w.readingRef)
    : undefined;

  const [insertedWord] = await db
    .insert(wordsTable)
    .values({
      kanjiId: k.id,
      readingId: matchedReading?.id ?? null,
      word: w.word,
      wordReading: w.wordReading,
      meaningsKo: w.meaningsKo,
      source: "generated",
      explanation: w.explanation,
    })
    .returning();
  result.insertedWords++;
  if (w.explanation) result.attachedWordExplanations++;

  // Insert all examples for this word.
  for (const ex of w.examples) {
    let tokens;
    try {
      tokens = parseSentence(
        ex.sentence,
        `delta-import ${k.character}/${w.word}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.warnings.push(
        `parse failed: ${k.character}/${w.word}: ${message}`,
      );
      continue;
    }
    await db.insert(examplesTable).values({
      wordId: insertedWord.id,
      sentence: tokens,
      sentenceTranslationKo: ex.sentenceTranslationKo,
      source: ex.source,
      explanation: ex.explanation,
    });
    result.insertedExamples++;
    if (ex.explanation) result.attachedExampleExplanations++;
  }
}

async function applySeedWordExtras(
  k: typeof kanjiTable.$inferSelect,
  w: ExportWord,
  mode: DeltaImportMode,
  result: DeltaImportResult,
) {
  const existing = await db.query.words.findFirst({
    where: and(
      eq(wordsTable.kanjiId, k.id),
      eq(wordsTable.word, w.word),
      eq(wordsTable.wordReading, w.wordReading),
    ),
    with: { examples: true },
  });
  if (!existing) {
    result.warnings.push(
      `seed word not found in DB: ${k.character}/${w.word} (${w.wordReading})`,
    );
    return;
  }

  // Word-level explanation
  if (w.explanation) {
    if (mode === "replace" || existing.explanation === null) {
      await db
        .update(wordsTable)
        .set({ explanation: w.explanation })
        .where(eq(wordsTable.id, existing.id));
      result.attachedWordExplanations++;
    }
  }

  // Examples — split by source
  const existingByMd = new Map(
    existing.examples.map((e) => [tokensToMarkdown(e.sentence), e]),
  );

  for (const ex of w.examples) {
    if (ex.source === "generated") {
      // Insert as new (or skip if duplicate sentence in merge mode)
      if (mode === "merge" && existingByMd.has(ex.sentence)) continue;
      let tokens;
      try {
        tokens = parseSentence(
          ex.sentence,
          `delta-import ${k.character}/${w.word}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.warnings.push(
          `parse failed: ${k.character}/${w.word}: ${message}`,
        );
        continue;
      }
      await db.insert(examplesTable).values({
        wordId: existing.id,
        sentence: tokens,
        sentenceTranslationKo: ex.sentenceTranslationKo,
        source: "generated",
        explanation: ex.explanation,
      });
      result.insertedExamples++;
      if (ex.explanation) result.attachedExampleExplanations++;
    } else {
      // Seed-source example: try to find matching existing example by markdown.
      const match = existingByMd.get(ex.sentence);
      if (!match) {
        result.warnings.push(
          `seed example not matched: ${k.character}/${w.word}: ${ex.sentence.slice(0, 40)}…`,
        );
        continue;
      }
      if (ex.explanation) {
        if (mode === "replace" || match.explanation === null) {
          await db
            .update(examplesTable)
            .set({ explanation: ex.explanation })
            .where(eq(examplesTable.id, match.id));
          result.attachedExampleExplanations++;
        }
      }
    }
  }
}

// Re-export the type used by the API layer.
export type { PackExport };
