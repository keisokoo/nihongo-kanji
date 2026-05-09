import { db } from "./db";
import type { ExampleExplanation, WordExplanation } from "./types";
import { tokensToMarkdown } from "../sentence";

export type ExportExample = {
  sentence: string;             // markdown
  sentenceTranslationKo: string | null;
  source: "seed" | "generated";
  explanation: ExampleExplanation | null;
};

export type ExportWord = {
  word: string;
  wordReading: string;
  source: "seed" | "generated";
  meaningsKo: string[];
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
  kind: "jlpt-delta" | "custom-full";
  title: string;
  description: string | null;
  exportedAt: string;
  items: ExportItem[];
};

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
  const d = db();
  const pack = await d.packs.get(packKey);
  if (!pack) throw new Error(`pack not found: ${packKey}`);

  const isJlpt = pack.kind === "jlpt";

  const allKanji = await d.kanji.where("packKey").equals(packKey).toArray();
  const kanjiIds = allKanji.map((k) => k.id);

  // Words for these kanji
  const allWords = kanjiIds.length
    ? await d.words.where("kanjiId").anyOf(kanjiIds).toArray()
    : [];
  const wordsByKanjiId = new Map<number, typeof allWords>();
  for (const w of allWords) {
    const list = wordsByKanjiId.get(w.kanjiId) ?? [];
    list.push(w);
    wordsByKanjiId.set(w.kanjiId, list);
  }

  // Examples for these words
  const wordIds = allWords.map((w) => w.id);
  const allExamples = wordIds.length
    ? await d.examples.where("wordId").anyOf(wordIds).toArray()
    : [];
  const examplesByWordId = new Map<number, typeof allExamples>();
  for (const e of allExamples) {
    const list = examplesByWordId.get(e.wordId) ?? [];
    list.push(e);
    examplesByWordId.set(e.wordId, list);
  }

  // Reading id -> reading text (for readingRef)
  const readingIds = [
    ...new Set(allWords.map((w) => w.readingId).filter((x): x is number => !!x)),
  ];
  const readings = readingIds.length
    ? await d.readings.bulkGet(readingIds)
    : [];
  const readingTextById = new Map<number, string>();
  for (const r of readings) {
    if (r) readingTextById.set(r.id, r.reading);
  }

  const items: ExportItem[] = [];
  for (const k of allKanji) {
    const ws = wordsByKanjiId.get(k.id) ?? [];
    const exportWords: ExportWord[] = [];

    for (const w of ws) {
      const exs = examplesByWordId.get(w.id) ?? [];
      const examplesPlain = exs.map((e) => ({
        sentence: tokensToMarkdown(e.sentence),
        sentenceTranslationKo: e.sentenceTranslationKo,
        source: e.source,
        explanation: e.explanation,
      }));

      let exportedExamples: ExportExample[];
      if (isJlpt) {
        if (!hasAiContent(w.source, w.explanation, examplesPlain)) continue;
        exportedExamples = examplesPlain.filter(
          (e) => e.source === "generated" || e.explanation !== null,
        );
      } else {
        exportedExamples = examplesPlain;
      }

      exportWords.push({
        word: w.word,
        wordReading: w.wordReading,
        source: w.source,
        meaningsKo: w.meaningsKo,
        readingRef: w.readingId ? (readingTextById.get(w.readingId) ?? null) : null,
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
