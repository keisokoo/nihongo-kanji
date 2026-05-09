/**
 * Generate a new AI word for a kanji + auto-create one example. Mirrors the
 * old POST /api/word behavior. Returns the inserted word + token usage.
 */
import { db } from "./db";
import {
  addUsage,
  generateExample,
  generateWord,
  ZERO_USAGE,
  type Tier,
  type Usage,
} from "./claude";
import { parseSentence } from "../sentence";
import type { Word } from "./types";

export type AddAiWordInput = {
  kanjiId: number;
  tier: Tier;
};

export type AddAiWordResult = {
  word: Word;
  kanjiReading: string;
  matched: boolean;
  modelUsed: string;
  example: {
    id: number;
    sentenceTranslationKo: string | null;
    modelUsed: string;
  } | null;
  usage: Usage & { model: string };
};

const MAX_ATTEMPTS = 2;

export async function addAiWord(
  input: AddAiWordInput,
): Promise<AddAiWordResult> {
  const d = db();
  const target = await d.kanji.get(input.kanjiId);
  if (!target) throw new Error("kanji not found");

  const readings = await d.readings
    .where("kanjiId")
    .equals(target.id)
    .toArray();
  const existingWords = await d.words
    .where("kanjiId")
    .equals(target.id)
    .toArray();
  const existingByText = new Set(
    existingWords.map((w) => `${w.word}|${w.wordReading}`),
  );

  let attempt = 0;
  let lastError: string | null = null;
  let totalUsage: Usage = ZERO_USAGE;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    let gen;
    try {
      gen = await generateWord(
        {
          kanjiChar: target.character,
          level: target.packKey,
          existingWords: existingWords.map((w) => ({
            word: w.word,
            wordReading: w.wordReading,
          })),
        },
        input.tier,
      );
    } catch (err) {
      lastError = err instanceof Error ? err.message : "generation failed";
      console.error("[addAiWord] generation failed:", err);
      break;
    }
    totalUsage = addUsage(totalUsage, gen.usage);

    const { word, wordReading, kanjiReading, meaningsKo } = gen.result;

    if (!word.includes(target.character)) {
      lastError = `generated word "${word}" does not contain ${target.character}`;
      continue;
    }
    if (existingByText.has(`${word}|${wordReading}`)) {
      lastError = `generated word "${word}" already exists`;
      continue;
    }

    const matchedReading = readings.find((r) => r.reading === kanjiReading);

    const wordId = (await d.words.add({
      kanjiId: target.id,
      readingId: matchedReading?.id ?? null,
      word,
      wordReading,
      meaningsKo: meaningsKo ?? [],
      source: "generated",
      createdAt: new Date(),
      explanation: null,
    } as never)) as number;
    const saved = (await d.words.get(wordId))!;

    // Best-effort example.
    let example: AddAiWordResult["example"] = null;
    try {
      const exGen = await generateExample(
        {
          word: saved.word,
          wordReading: saved.wordReading,
          kanjiChar: target.character,
          level: target.packKey,
          excludeSentences: [],
        },
        input.tier,
      );
      totalUsage = addUsage(totalUsage, exGen.usage);
      const tokens = parseSentence(
        exGen.result.sentence,
        `generated ${saved.word}/${saved.wordReading}`,
      );
      const targetCount = tokens.filter((t) => t.target).length;
      if (targetCount !== 1) {
        throw new Error(
          `generated sentence has ${targetCount} target markers (expected 1)`,
        );
      }
      const exId = (await d.examples.add({
        wordId: saved.id,
        sentence: tokens,
        sentenceTranslationKo: exGen.result.translationKo,
        source: "generated",
        createdAt: new Date(),
        explanation: null,
      } as never)) as number;
      example = {
        id: exId,
        sentenceTranslationKo: exGen.result.translationKo,
        modelUsed: exGen.modelUsed,
      };
    } catch (err) {
      console.warn(
        "[addAiWord] example generation failed (non-fatal):",
        err instanceof Error ? err.message : err,
      );
    }

    return {
      word: saved,
      kanjiReading,
      matched: !!matchedReading,
      modelUsed: gen.modelUsed,
      example,
      usage: { ...totalUsage, model: gen.modelUsed },
    };
  }

  throw new Error(lastError ?? "failed to generate a valid word");
}
