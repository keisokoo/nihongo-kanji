import { db } from "./db";
import {
  generateGrammarItemExplanation,
  generateGrammarExampleExplanation,
  generateGrammarQuizExplanation,
  type Tier,
  type Usage,
} from "./claude";
import { tokensToPlain } from "../sentence";
import { parseSentence } from "../sentence";
import type {
  GrammarExampleExplanation,
  GrammarItem,
  GrammarItemDeepExplanation,
  GrammarQuizExplanation,
  GrammarQuiz,
} from "./grammar-types";

type Result<T> = {
  explanation: T;
  cached: boolean;
  usage: (Usage & { model: string }) | null;
};

function levelOf(item: GrammarItem): string {
  // packKey 가 "N5-grammar" 같은 형식이라 "N5" 만 뽑음. 커스텀 팩이면 그대로.
  const m = /^([nN][1-5])-grammar$/.exec(item.packKey);
  return m ? m[1].toUpperCase() : item.packKey;
}

// ─── Item-level deep explanation ────────────────────────────────────────────

export async function addGrammarItemDeepExplanation(
  itemId: number,
  tier: Tier = "default",
): Promise<Result<GrammarItemDeepExplanation>> {
  const d = db();
  const item = await d.grammarItems.get(itemId);
  if (!item) throw new Error("grammar item not found");

  if (tier !== "premium" && item.deepExplanation) {
    return { explanation: item.deepExplanation, cached: true, usage: null };
  }

  const gen = await generateGrammarItemExplanation(
    {
      pattern: item.pattern,
      meaningsKo: item.meaningsKo,
      baseExplanation: item.explanation,
      formation: item.formation,
      level: levelOf(item),
    },
    tier,
  );

  const explanation: GrammarItemDeepExplanation = {
    whenToUse: gen.result.whenToUse,
    comparison: gen.result.comparison,
    commonMistakes: gen.result.commonMistakes,
    takeaways: gen.result.takeaways,
    modelUsed: gen.modelUsed,
    createdAt: new Date().toISOString(),
  };

  await d.grammarItems.update(itemId, { deepExplanation: explanation });

  return {
    explanation,
    cached: false,
    usage: { ...gen.usage, model: gen.modelUsed },
  };
}

// ─── Example-level explanation ──────────────────────────────────────────────

export async function addGrammarExampleExplanation(
  itemId: number,
  exampleIndex: number,
  tier: Tier = "default",
): Promise<Result<GrammarExampleExplanation>> {
  const d = db();
  const item = await d.grammarItems.get(itemId);
  if (!item) throw new Error("grammar item not found");
  const example = item.examples[exampleIndex];
  if (!example) throw new Error(`example[${exampleIndex}] not found`);

  if (tier !== "premium" && example.explanation) {
    return { explanation: example.explanation, cached: true, usage: null };
  }

  const tokens = parseSentence(example.sentence, `${item.pattern} example`);
  const plain = tokensToPlain(tokens);

  const gen = await generateGrammarExampleExplanation(
    {
      sentence: plain,
      translationKo: example.sentenceTranslationKo,
      pattern: item.pattern,
      patternMeaning: item.meaningsKo[0] ?? "",
      level: levelOf(item),
    },
    tier,
  );

  const explanation: GrammarExampleExplanation = {
    nuance: gen.result.nuance,
    grammar: gen.result.grammar,
    pronunciation: gen.result.pronunciation,
    takeaways: gen.result.takeaways,
    modelUsed: gen.modelUsed,
    createdAt: new Date().toISOString(),
  };

  // Update the embedded array. Read-modify-write since Dexie doesn't have
  // partial array updates.
  const newExamples = [...item.examples];
  newExamples[exampleIndex] = { ...example, explanation };
  await d.grammarItems.update(itemId, { examples: newExamples });

  return {
    explanation,
    cached: false,
    usage: { ...gen.usage, model: gen.modelUsed },
  };
}

// ─── Quiz-level explanation ─────────────────────────────────────────────────

/** Build a plain-text representation of a quiz prompt (for AI input). */
function quizPromptText(q: GrammarQuiz): string {
  if (q.type === "conjugation") {
    return `Dictionary form "${q.payload.dictForm}" (${q.payload.group}) → target form "${q.payload.targetFormLabel}"`;
  }
  if (q.type === "particle_blank" || q.type === "pattern_blank") {
    const tokens = parseSentence(q.payload.sentence, `quiz blank`);
    return `Sentence with blank: ${tokensToPlain(tokens)}`;
  }
  if (q.type === "form_meaning") {
    const promptTokens = parseSentence(
      q.payload.prompt,
      `quiz form-meaning prompt`,
    );
    let out = `Japanese form: ${tokensToPlain(promptTokens)}`;
    if (q.payload.contextSentence) {
      const ctxTokens = parseSentence(
        q.payload.contextSentence,
        `quiz form-meaning ctx`,
      );
      out += `\nContext: ${tokensToPlain(ctxTokens)}`;
    }
    out += `\nQuestion: choose the correct Korean meaning`;
    return out;
  }
  // ko_to_jp_form
  return `Korean: ${q.payload.ko}\nQuestion: choose the correct Japanese sentence`;
}

function quizPlainAnswer(q: GrammarQuiz): {
  answer: string;
  distractors: string[];
} {
  if (
    q.type === "conjugation" ||
    q.type === "form_meaning" ||
    q.type === "particle_blank" ||
    q.type === "pattern_blank"
  ) {
    return {
      answer: q.payload.answer,
      distractors: [...q.payload.distractors],
    };
  }
  // ko_to_jp_form: 일본어 문장에 마크업 들어있으니 plain 으로 변환
  const ans = tokensToPlain(parseSentence(q.payload.answer, "quiz ans"));
  const dis = q.payload.distractors.map((d) =>
    tokensToPlain(parseSentence(d, "quiz dis")),
  );
  return { answer: ans, distractors: dis };
}

export async function addGrammarQuizExplanation(
  itemId: number,
  quizIndex: number,
  tier: Tier = "default",
): Promise<Result<GrammarQuizExplanation>> {
  const d = db();
  const item = await d.grammarItems.get(itemId);
  if (!item) throw new Error("grammar item not found");
  const quiz = item.quizzes[quizIndex];
  if (!quiz) throw new Error(`quiz[${quizIndex}] not found`);

  if (tier !== "premium" && quiz.explanation) {
    return { explanation: quiz.explanation, cached: true, usage: null };
  }

  const promptText = quizPromptText(quiz);
  const { answer, distractors } = quizPlainAnswer(quiz);

  const gen = await generateGrammarQuizExplanation(
    {
      quizType: quiz.type,
      promptText,
      answer,
      distractors,
      pattern: item.pattern,
      patternMeaning: item.meaningsKo[0] ?? "",
      level: levelOf(item),
    },
    tier,
  );

  const explanation: GrammarQuizExplanation = {
    promptAnalysis: gen.result.promptAnalysis,
    correctAnswer: gen.result.correctAnswer,
    whyCorrect: gen.result.whyCorrect,
    whyOthersWrong: gen.result.whyOthersWrong,
    modelUsed: gen.modelUsed,
    createdAt: new Date().toISOString(),
  };

  const newQuizzes = [...item.quizzes];
  newQuizzes[quizIndex] = { ...quiz, explanation };
  await d.grammarItems.update(itemId, { quizzes: newQuizzes });

  return {
    explanation,
    cached: false,
    usage: { ...gen.usage, model: gen.modelUsed },
  };
}
