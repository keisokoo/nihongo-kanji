import { db } from "./db";

/**
 * AI 가 생성한 데이터 모음 — /ai-data 라우트용.
 *
 * 종류별로 일정 갯수만 surface (각 N개씩). "모두 보기" 는 향후 확장 여지.
 */

const PER_KIND_LIMIT = 50;

export type GeneratedWordView = {
  id: number;
  packKey: string;
  kanjiId: number;
  kanjiCharacter: string;
  word: string;
  wordReading: string;
  meaningsKo: string[];
  createdAt: Date;
};

export type GeneratedExampleView = {
  id: number;
  wordId: number;
  word: string;
  wordReading: string;
  packKey: string;
  kanjiCharacter: string;
  sentence: string; // markdown
  translationKo: string | null;
  createdAt: Date;
};

export type WordExplanationView = {
  wordId: number;
  word: string;
  wordReading: string;
  packKey: string;
  kanjiCharacter: string;
  reasoning: string;
  mnemonic: string;
  modelUsed: string;
  createdAt: string;
};

export type ExampleExplanationView = {
  exampleId: number;
  wordId: number;
  word: string;
  packKey: string;
  kanjiCharacter: string;
  sentence: string;
  modelUsed: string;
  createdAt: string;
  /** preview only — 전체 본문은 학습 페이지에서 */
  preview: string;
};

export type GrammarItemExplanationView = {
  itemId: number;
  packKey: string;
  pattern: string;
  modelUsed: string;
  createdAt: string;
  preview: string;
};

export type GrammarExampleExplanationView = {
  itemId: number;
  pattern: string;
  packKey: string;
  exampleIndex: number;
  sentence: string;
  modelUsed: string;
  createdAt: string;
  preview: string;
};

export type GrammarQuizExplanationView = {
  itemId: number;
  pattern: string;
  packKey: string;
  quizIndex: number;
  quizType: string;
  modelUsed: string;
  createdAt: string;
  preview: string;
};

export type GeneratedGrammarExampleView = {
  itemId: number;
  pattern: string;
  packKey: string;
  exampleIndex: number;
  sentence: string;
  translationKo: string;
};

export type GeneratedGrammarQuizView = {
  itemId: number;
  pattern: string;
  packKey: string;
  quizIndex: number;
  quizType: string;
  answer: string;
};

export type AiDataSnapshot = {
  generatedWords: GeneratedWordView[];
  generatedExamples: GeneratedExampleView[];
  wordExplanations: WordExplanationView[];
  exampleExplanations: ExampleExplanationView[];
  grammarItemExplanations: GrammarItemExplanationView[];
  grammarExampleExplanations: GrammarExampleExplanationView[];
  grammarQuizExplanations: GrammarQuizExplanationView[];
  generatedGrammarExamples: GeneratedGrammarExampleView[];
  generatedGrammarQuizzes: GeneratedGrammarQuizView[];
  totals: {
    generatedWords: number;
    generatedExamples: number;
    wordExplanations: number;
    exampleExplanations: number;
    grammarItemExplanations: number;
    grammarExampleExplanations: number;
    grammarQuizExplanations: number;
    generatedGrammarExamples: number;
    generatedGrammarQuizzes: number;
  };
};

function shorten(s: string, max = 80): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trim() + "…";
}

export async function loadAiData(): Promise<AiDataSnapshot> {
  const d = db();

  // 한자 / 단어 lookup helpers
  const allKanji = await d.kanji.toArray();
  const kanjiById = new Map(allKanji.map((k) => [k.id, k]));

  // 1) Generated words
  const generatedWordsAll = await d.words
    .filter((w) => w.source === "generated")
    .toArray();
  generatedWordsAll.sort((a, b) => +b.createdAt - +a.createdAt);

  const generatedWords: GeneratedWordView[] = generatedWordsAll
    .slice(0, PER_KIND_LIMIT)
    .map((w) => {
      const k = kanjiById.get(w.kanjiId);
      return {
        id: w.id,
        packKey: k?.packKey ?? "",
        kanjiId: w.kanjiId,
        kanjiCharacter: k?.character ?? "",
        word: w.word,
        wordReading: w.wordReading,
        meaningsKo: w.meaningsKo,
        createdAt: w.createdAt,
      };
    });

  // 2) Generated examples
  const generatedExamplesAll = await d.examples
    .filter((e) => e.source === "generated")
    .toArray();
  generatedExamplesAll.sort((a, b) => +b.createdAt - +a.createdAt);

  const wordIdsForExamples = [
    ...new Set(generatedExamplesAll.map((e) => e.wordId)),
  ];
  const wordsForExamples =
    wordIdsForExamples.length > 0
      ? await d.words.bulkGet(wordIdsForExamples)
      : [];
  const wordById = new Map<number, (typeof wordsForExamples)[0]>();
  for (const w of wordsForExamples) {
    if (w) wordById.set(w.id, w);
  }

  const generatedExamples: GeneratedExampleView[] = generatedExamplesAll
    .slice(0, PER_KIND_LIMIT)
    .map((e) => {
      const w = wordById.get(e.wordId);
      const k = w ? kanjiById.get(w.kanjiId) : null;
      return {
        id: e.id,
        wordId: e.wordId,
        word: w?.word ?? "",
        wordReading: w?.wordReading ?? "",
        packKey: k?.packKey ?? "",
        kanjiCharacter: k?.character ?? "",
        sentence: e.sentence
          .map((t) => {
            if (t.target) return `{{${t.text}}}`;
            if (t.reading) return `{${t.text}|${t.reading}}`;
            return t.text;
          })
          .join(""),
        translationKo: e.sentenceTranslationKo,
        createdAt: e.createdAt,
      };
    });

  // 3) Word explanations
  const wordsWithExplAll = await d.words
    .filter((w) => w.explanation !== null)
    .toArray();
  wordsWithExplAll.sort((a, b) => {
    const ax = a.explanation?.createdAt ?? "";
    const bx = b.explanation?.createdAt ?? "";
    return bx.localeCompare(ax);
  });

  const wordExplanations: WordExplanationView[] = wordsWithExplAll
    .slice(0, PER_KIND_LIMIT)
    .map((w) => {
      const k = kanjiById.get(w.kanjiId);
      return {
        wordId: w.id,
        word: w.word,
        wordReading: w.wordReading,
        packKey: k?.packKey ?? "",
        kanjiCharacter: k?.character ?? "",
        reasoning: shorten(w.explanation?.reasoning ?? "", 200),
        mnemonic: shorten(w.explanation?.mnemonic ?? "", 200),
        modelUsed: w.explanation?.modelUsed ?? "",
        createdAt: w.explanation?.createdAt ?? "",
      };
    });

  // 4) Example explanations
  const examplesWithExplAll = await d.examples
    .filter((e) => e.explanation !== null)
    .toArray();
  examplesWithExplAll.sort((a, b) => {
    const ax = a.explanation?.createdAt ?? "";
    const bx = b.explanation?.createdAt ?? "";
    return bx.localeCompare(ax);
  });

  const exampleWordIds = [
    ...new Set(examplesWithExplAll.map((e) => e.wordId)),
  ];
  const exampleWords =
    exampleWordIds.length > 0 ? await d.words.bulkGet(exampleWordIds) : [];
  const exWordById = new Map<number, (typeof exampleWords)[0]>();
  for (const w of exampleWords) if (w) exWordById.set(w.id, w);

  const exampleExplanations: ExampleExplanationView[] = examplesWithExplAll
    .slice(0, PER_KIND_LIMIT)
    .map((e) => {
      const w = exWordById.get(e.wordId);
      const k = w ? kanjiById.get(w.kanjiId) : null;
      const sentencePlain = e.sentence.map((t) => t.text).join("");
      const exp = e.explanation;
      const preview = shorten(
        (exp?.nuance ?? "") + " " + (exp?.takeaways ?? ""),
        160,
      );
      return {
        exampleId: e.id,
        wordId: e.wordId,
        word: w?.word ?? "",
        packKey: k?.packKey ?? "",
        kanjiCharacter: k?.character ?? "",
        sentence: sentencePlain,
        modelUsed: exp?.modelUsed ?? "",
        createdAt: exp?.createdAt ?? "",
        preview,
      };
    });

  // 5) Grammar item explanations + grammar example/quiz explanations + generated grammar exam/quiz
  const grammarItemsWithAi = await d.grammarItems.toArray();

  const grammarItemExplanations: GrammarItemExplanationView[] = [];
  const grammarExampleExplanations: GrammarExampleExplanationView[] = [];
  const grammarQuizExplanations: GrammarQuizExplanationView[] = [];
  const generatedGrammarExamples: GeneratedGrammarExampleView[] = [];
  const generatedGrammarQuizzes: GeneratedGrammarQuizView[] = [];

  for (const it of grammarItemsWithAi) {
    if (it.deepExplanation) {
      grammarItemExplanations.push({
        itemId: it.id,
        packKey: it.packKey,
        pattern: it.pattern,
        modelUsed: it.deepExplanation.modelUsed,
        createdAt: it.deepExplanation.createdAt,
        preview: shorten(
          (it.deepExplanation.whenToUse ?? "") +
            " " +
            (it.deepExplanation.takeaways ?? ""),
          160,
        ),
      });
    }
    for (const [i, ex] of (it.examples ?? []).entries()) {
      if (ex.explanation) {
        grammarExampleExplanations.push({
          itemId: it.id,
          pattern: it.pattern,
          packKey: it.packKey,
          exampleIndex: i,
          sentence: ex.sentence.replace(/\{\{|\}\}|\{|\}|\|/g, ""),
          modelUsed: ex.explanation.modelUsed,
          createdAt: ex.explanation.createdAt,
          preview: shorten(
            (ex.explanation.nuance ?? "") +
              " " +
              (ex.explanation.takeaways ?? ""),
            160,
          ),
        });
      }
      if (ex.source === "generated") {
        generatedGrammarExamples.push({
          itemId: it.id,
          pattern: it.pattern,
          packKey: it.packKey,
          exampleIndex: i,
          sentence: ex.sentence.replace(/\{\{|\}\}|\{|\}|\|/g, ""),
          translationKo: ex.sentenceTranslationKo,
        });
      }
    }
    for (const [i, q] of (it.quizzes ?? []).entries()) {
      if (q.explanation) {
        grammarQuizExplanations.push({
          itemId: it.id,
          pattern: it.pattern,
          packKey: it.packKey,
          quizIndex: i,
          quizType: q.type,
          modelUsed: q.explanation.modelUsed,
          createdAt: q.explanation.createdAt,
          preview: shorten(q.explanation.whyCorrect ?? "", 160),
        });
      }
      if (q.source === "generated") {
        generatedGrammarQuizzes.push({
          itemId: it.id,
          pattern: it.pattern,
          packKey: it.packKey,
          quizIndex: i,
          quizType: q.type,
          answer: q.payload.answer,
        });
      }
    }
  }

  // Sort by recency where available
  grammarItemExplanations.sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  grammarExampleExplanations.sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  grammarQuizExplanations.sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );

  const totals = {
    generatedWords: generatedWordsAll.length,
    generatedExamples: generatedExamplesAll.length,
    wordExplanations: wordsWithExplAll.length,
    exampleExplanations: examplesWithExplAll.length,
    grammarItemExplanations: grammarItemExplanations.length,
    grammarExampleExplanations: grammarExampleExplanations.length,
    grammarQuizExplanations: grammarQuizExplanations.length,
    generatedGrammarExamples: generatedGrammarExamples.length,
    generatedGrammarQuizzes: generatedGrammarQuizzes.length,
  };

  return {
    generatedWords,
    generatedExamples,
    wordExplanations,
    exampleExplanations,
    grammarItemExplanations: grammarItemExplanations.slice(0, PER_KIND_LIMIT),
    grammarExampleExplanations: grammarExampleExplanations.slice(
      0,
      PER_KIND_LIMIT,
    ),
    grammarQuizExplanations: grammarQuizExplanations.slice(0, PER_KIND_LIMIT),
    generatedGrammarExamples: generatedGrammarExamples.slice(0, PER_KIND_LIMIT),
    generatedGrammarQuizzes: generatedGrammarQuizzes.slice(0, PER_KIND_LIMIT),
    totals,
  };
}
