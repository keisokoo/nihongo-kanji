import { db } from "./db";
import {
  generateExample,
  generateExampleExplanation,
  generateExplanation,
  generateReadings,
  type Tier,
  type Usage,
} from "./claude";
import { parseSentence, tokensToPlain } from "../sentence";
import type { Example, ExampleExplanation, WordExplanation } from "./types";

export type AddExampleResult = {
  example: Example;
  cached: boolean;
  modelUsed: string;
  usage: (Usage & { model: string }) | null;
};

/**
 * Generate an AI example for an existing word. Mirrors the old POST /api/example.
 * If `tier === "default"` and the word already has examples, picks one at random
 * (excluding `excludeIds`). Otherwise calls the AI and inserts a new row.
 */
export async function addExampleToWord(
  wordId: number,
  tier: Tier,
  opts: { excludeIds?: number[] } = {},
): Promise<AddExampleResult> {
  const d = db();
  const word = await d.words.get(wordId);
  if (!word) throw new Error("word not found");
  const kanji = await d.kanji.get(word.kanjiId);
  if (!kanji) throw new Error("kanji not found");

  // Default tier = try to reuse cached example first.
  if (tier !== "premium") {
    const all = await d.examples.where("wordId").equals(wordId).toArray();
    const eligible = all.filter(
      (e) => !opts.excludeIds || !opts.excludeIds.includes(e.id),
    );
    if (eligible.length > 0) {
      const pick = eligible[Math.floor(Math.random() * eligible.length)];
      return { example: pick, cached: true, modelUsed: "", usage: null };
    }
  }

  const allExamples = await d.examples.where("wordId").equals(wordId).toArray();
  const existingMd = allExamples.map((e) => tokensToPlain(e.sentence));

  const gen = await generateExample(
    {
      word: word.word,
      wordReading: word.wordReading,
      kanjiChar: kanji.character,
      level: kanji.packKey,
      excludeSentences: existingMd,
    },
    tier,
  );

  const tokens = parseSentence(
    gen.result.sentence,
    `generated ${word.word}/${word.wordReading}`,
  );
  const targetCount = tokens.filter((t) => t.target).length;
  if (targetCount !== 1) {
    throw new Error(
      `generated sentence has ${targetCount} target markers (expected 1)`,
    );
  }

  const id = (await d.examples.add({
    wordId,
    sentence: tokens,
    sentenceTranslationKo: gen.result.translationKo,
    source: "generated",
    createdAt: new Date(),
    explanation: null,
  } as never)) as number;
  const inserted = (await d.examples.get(id))!;

  return {
    example: inserted,
    cached: false,
    modelUsed: gen.modelUsed,
    usage: { ...gen.usage, model: gen.modelUsed },
  };
}

export type AddExampleExplanationResult = {
  explanation: ExampleExplanation;
  cached: boolean;
  usage: (Usage & { model: string }) | null;
};

/**
 * Generate (or fetch cached) explanation for an example. Mirrors POST
 * /api/example-explanation.
 */
export async function addExampleExplanation(
  exampleId: number,
  tier: Tier,
): Promise<AddExampleExplanationResult> {
  const d = db();
  const example = await d.examples.get(exampleId);
  if (!example) throw new Error("example not found");

  if (tier !== "premium" && example.explanation) {
    return { explanation: example.explanation, cached: true, usage: null };
  }

  const word = await d.words.get(example.wordId);
  if (!word) throw new Error("word not found");
  const kanji = await d.kanji.get(word.kanjiId);
  if (!kanji) throw new Error("kanji not found");

  const gen = await generateExampleExplanation(
    {
      sentence: tokensToPlain(example.sentence),
      translationKo: example.sentenceTranslationKo ?? "",
      focusWord: word.word,
      focusWordReading: word.wordReading,
      level: kanji.packKey,
    },
    tier,
  );

  const explanation: ExampleExplanation = {
    nuance: gen.result.nuance,
    grammar: gen.result.grammar,
    pronunciation: gen.result.pronunciation,
    takeaways: gen.result.takeaways,
    modelUsed: gen.modelUsed,
    createdAt: new Date().toISOString(),
  };

  await d.examples.update(exampleId, { explanation });

  return {
    explanation,
    cached: false,
    usage: { ...gen.usage, model: gen.modelUsed },
  };
}

export type AddWordExplanationResult = {
  explanation: WordExplanation;
  cached: boolean;
  usage: (Usage & { model: string }) | null;
};

/**
 * Generate (or fetch cached) explanation for a word. Mirrors POST
 * /api/explanation.
 */
export async function addWordExplanation(
  wordId: number,
  tier: Tier,
): Promise<AddWordExplanationResult> {
  const d = db();
  const word = await d.words.get(wordId);
  if (!word) throw new Error("word not found");

  if (tier !== "premium" && word.explanation) {
    return { explanation: word.explanation, cached: true, usage: null };
  }

  const kanji = await d.kanji.get(word.kanjiId);
  if (!kanji) throw new Error("kanji not found");

  const gen = await generateExplanation(
    {
      word: word.word,
      wordReading: word.wordReading,
      kanjiChar: kanji.character,
      level: kanji.packKey,
    },
    tier,
  );

  const explanation: WordExplanation = {
    reasoning: gen.result.reasoning,
    mnemonic: gen.result.mnemonic,
    modelUsed: gen.modelUsed,
    createdAt: new Date().toISOString(),
  };

  await d.words.update(wordId, { explanation });

  return {
    explanation,
    cached: false,
    usage: { ...gen.usage, model: gen.modelUsed },
  };
}

export type RegenerateKanjiResult = {
  meaningKo: string;
  meaningModel: string;
  on: string[];
  kun: string[];
  count: number;
  usage: (Usage & { model: string }) | null;
};

/**
 * Regenerate readings + meaning for a kanji using AI. Replaces all readings
 * and updates meaningKo. Mirrors POST /api/readings (formerly Kanjipedia
 * scraping; now AI-only since we're a static PWA).
 */
export async function regenerateKanjiReadings(
  kanjiId: number,
  tier: Tier = "default",
): Promise<RegenerateKanjiResult> {
  const d = db();
  const target = await d.kanji.get(kanjiId);
  if (!target) throw new Error("kanji not found");

  const gen = await generateReadings({ kanjiChar: target.character }, tier);
  const { on, kun, meaningKo } = gen.result;

  if (on.length === 0 && kun.length === 0) {
    throw new Error("no readings extracted");
  }

  await db().transaction("rw", [d.readings, d.kanji], async () => {
    await d.readings.where("kanjiId").equals(kanjiId).delete();
    for (const r of on) {
      await d.readings.add({
        kanjiId,
        type: "on",
        reading: r,
        romaji: null,
      } as never);
    }
    for (const r of kun) {
      await d.readings.add({
        kanjiId,
        type: "kun",
        reading: r,
        romaji: null,
      } as never);
    }
    await d.kanji.update(kanjiId, { meaningKo });
  });

  return {
    meaningKo,
    meaningModel: gen.modelUsed,
    on,
    kun,
    count: on.length + kun.length,
    usage: { ...gen.usage, model: gen.modelUsed },
  };
}
