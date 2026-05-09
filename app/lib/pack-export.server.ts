import { eq, inArray } from "drizzle-orm";
import {
  db,
  examples as examplesTable,
  kanji as kanjiTable,
  packs as packsTable,
  readings as readingsTable,
  type ExampleExplanation,
  type WordExplanation,
} from "./db";
import { tokensToMarkdown } from "./sentence";

export type ExportExample = {
  /** Inline-markdown form of the sentence (round-trip via parseSentence). */
  sentence: string;
  sentenceTranslationKo: string | null;
  /** Marks whether this example was originally from seed or AI-generated. */
  source: "seed" | "generated";
  explanation: ExampleExplanation | null;
};

export type ExportWord = {
  word: string;
  wordReading: string;
  /** Marks whether this word came from seed or AI-generated. */
  source: "seed" | "generated";
  meaningsKo: string[];
  /** Reading text (e.g. イチ, ひと) for re-linking on import; may be null. */
  readingRef: string | null;
  explanation: WordExplanation | null;
  examples: ExportExample[];
};

export type ExportItem = {
  kanjiCharacter: string;
  words: ExportWord[];
};

export type PackExport = {
  version: 1;
  key: string;
  /**
   * "jlpt-delta" — only AI-generated additions on top of the bundled seed.
   *                Insufficient on its own; must be applied to a DB that
   *                already has the JLPT seed loaded.
   * "custom-full" — full snapshot of a custom pack; can be imported into a
   *                 fresh DB to recreate the pack.
   */
  kind: "jlpt-delta" | "custom-full";
  title: string;
  description: string | null;
  exportedAt: string;
  items: ExportItem[];
};

/**
 * Decide whether a word entry has any AI-added content worth exporting in
 * jlpt-delta mode. (Pure-seed words with no explanation/examples skipped.)
 */
function hasAiContent(
  source: "seed" | "generated",
  explanation: WordExplanation | null,
  examples: Array<{
    source: "seed" | "generated";
    explanation: ExampleExplanation | null;
  }>,
): boolean {
  if (source === "generated") return true;
  if (explanation) return true;
  for (const e of examples) {
    if (e.source === "generated") return true;
    if (e.explanation) return true;
  }
  return false;
}

export async function exportPack(packKey: string): Promise<PackExport> {
  const pack = await db.query.packs.findFirst({
    where: eq(packsTable.key, packKey),
  });
  if (!pack) throw new Error(`pack not found: ${packKey}`);

  const isJlpt = pack.kind === "jlpt";

  const allKanji = await db.query.kanji.findMany({
    where: eq(kanjiTable.packKey, packKey),
    with: {
      words: {
        with: { examples: true },
      },
    },
  });

  // readingId -> reading text, for stable readingRef export
  const readingIds = allKanji.flatMap((k) =>
    k.words.map((w) => w.readingId).filter((x): x is number => x !== null),
  );
  const readingByIdMap = new Map<number, string>();
  if (readingIds.length > 0) {
    const rows = await db
      .select({ id: readingsTable.id, reading: readingsTable.reading })
      .from(readingsTable)
      .where(inArray(readingsTable.id, readingIds));
    for (const r of rows) readingByIdMap.set(r.id, r.reading);
  }

  const items: ExportItem[] = [];
  for (const k of allKanji) {
    const exportWords: ExportWord[] = [];
    for (const w of k.words) {
      const examplesPlain = w.examples.map((e) => ({
        sentence: tokensToMarkdown(e.sentence),
        sentenceTranslationKo: e.sentenceTranslationKo,
        source: e.source,
        explanation: e.explanation,
      }));

      let exportedExamples: ExportExample[];
      if (isJlpt) {
        // Skip the word entirely if no AI content
        if (!hasAiContent(w.source, w.explanation, examplesPlain)) continue;
        // For jlpt-delta, only include examples that carry AI work
        exportedExamples = examplesPlain.filter(
          (e) => e.source === "generated" || e.explanation !== null,
        );
      } else {
        // custom-full: include all examples
        exportedExamples = examplesPlain;
      }

      exportWords.push({
        word: w.word,
        wordReading: w.wordReading,
        source: w.source,
        meaningsKo: w.meaningsKo,
        readingRef: w.readingId ? (readingByIdMap.get(w.readingId) ?? null) : null,
        explanation: w.explanation,
        examples: exportedExamples,
      });
    }
    if (exportWords.length > 0) {
      items.push({ kanjiCharacter: k.character, words: exportWords });
    }
  }

  return {
    version: 1,
    key: pack.key,
    kind: isJlpt ? "jlpt-delta" : "custom-full",
    title: pack.title,
    description: pack.description,
    exportedAt: new Date().toISOString(),
    items,
  };
}

export type ExportSummary = {
  packKey: string;
  kind: "jlpt-delta" | "custom-full";
  kanjiTouched: number;
  wordCount: number;
  exampleCount: number;
};

export function summarize(data: PackExport): ExportSummary {
  let words = 0;
  let examples = 0;
  for (const it of data.items) {
    words += it.words.length;
    for (const w of it.words) examples += w.examples.length;
  }
  return {
    packKey: data.key,
    kind: data.kind,
    kanjiTouched: data.items.length,
    wordCount: words,
    exampleCount: examples,
  };
}
