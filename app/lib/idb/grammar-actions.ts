import { db } from "./db";
import {
  generateGrammarItemExplanation,
  generateGrammarExampleExplanation,
  generateGrammarQuizExplanation,
  generateGrammarExample,
  generateGrammarQuiz,
  generateGrammarUsageGuide,
  type Tier,
  type Usage,
} from "./claude";
import { tokensToPlain } from "../sentence";
import { parseSentence } from "../sentence";
import type {
  GrammarExample,
  GrammarExampleExplanation,
  GrammarItem,
  GrammarItemDeepExplanation,
  GrammarQuiz,
  GrammarQuizExplanation,
  GrammarQuizType,
  GrammarUsageGuide,
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

// ─── Item-level usage guide ─────────────────────────────────────────────────

export async function addGrammarUsageGuide(
  itemId: number,
  tier: Tier = "default",
): Promise<Result<GrammarUsageGuide>> {
  const d = db();
  const item = await d.grammarItems.get(itemId);
  if (!item) throw new Error("grammar item not found");

  if (tier !== "premium" && item.usageGuide) {
    return { explanation: item.usageGuide, cached: true, usage: null };
  }

  const gen = await generateGrammarUsageGuide(
    {
      pattern: item.pattern,
      meaningsKo: item.meaningsKo,
      baseExplanation: item.explanation,
      formation: item.formation,
      category: item.category,
      level: levelOf(item),
    },
    tier,
  );

  const guide: GrammarUsageGuide = {
    intro: gen.result.intro,
    sections: gen.result.sections.map((s) => ({
      title: s.title,
      rule: s.rule,
      examples: s.examples.map((e) => ({
        jp: e.jp,
        jpReading: e.jpReading ?? null,
        conjugated: e.conjugated ?? null,
        gloss: e.gloss,
      })),
      note: s.note ?? null,
    })),
    modelUsed: gen.modelUsed,
    createdAt: new Date().toISOString(),
  };

  await d.grammarItems.update(itemId, { usageGuide: guide });

  return {
    explanation: guide,
    cached: false,
    usage: { ...gen.usage, model: gen.modelUsed },
  };
}

// ─── Add new example / quiz via AI ──────────────────────────────────────────

export type AddGrammarExampleResult = {
  example: GrammarExample;
  usage: (Usage & { model: string }) | null;
};

export async function addGrammarExample(
  itemId: number,
  tier: Tier = "default",
): Promise<AddGrammarExampleResult> {
  const d = db();
  const item = await d.grammarItems.get(itemId);
  if (!item) throw new Error("grammar item not found");

  const existing = (item.examples ?? []).map((ex) => ex.sentence);

  const gen = await generateGrammarExample(
    {
      pattern: item.pattern,
      meaningKo: item.meaningsKo[0] ?? "",
      formation: item.formation,
      level: levelOf(item),
      existingSentences: existing,
    },
    tier,
  );

  // 마크업 검증 — parseSentence 가 던지면 throw, target 1개 확인.
  const tokens = parseSentence(
    gen.result.sentence,
    `add-grammar-example ${item.pattern}`,
  );
  const targetCount = tokens.filter((t) => t.target).length;
  if (targetCount !== 1) {
    throw new Error(
      `generated sentence has ${targetCount} target markers (expected 1)`,
    );
  }

  // Dedupe 체크 (혹시 모델이 무시했을 경우)
  if (existing.includes(gen.result.sentence)) {
    throw new Error("generated sentence duplicates an existing one");
  }

  const newExample: GrammarExample = {
    sentence: gen.result.sentence,
    sentenceTranslationKo: gen.result.sentenceTranslationKo,
    note: gen.result.note ?? null,
    source: "generated",
    explanation: null,
  };

  const newExamples = [...(item.examples ?? []), newExample];
  await d.grammarItems.update(itemId, { examples: newExamples });

  return {
    example: newExample,
    usage: { ...gen.usage, model: gen.modelUsed },
  };
}

export type AddGrammarQuizResult = {
  quiz: GrammarQuiz;
  usage: (Usage & { model: string }) | null;
};

const VALID_QUIZ_TYPES: ReadonlyArray<GrammarQuizType> = [
  "conjugation",
  "particle_blank",
  "pattern_blank",
  "form_meaning",
  "ko_to_jp_form",
];

const VERB_GROUPS = new Set([
  "godan",
  "ichidan",
  "irregular",
  "i_adj",
  "na_adj",
  "noun",
  "any",
]);

export async function addGrammarQuiz(
  itemId: number,
  tier: Tier = "default",
): Promise<AddGrammarQuizResult> {
  const d = db();
  const item = await d.grammarItems.get(itemId);
  if (!item) throw new Error("grammar item not found");

  const applicable = item.applicableQuizTypes;
  if (applicable.length === 0) {
    throw new Error("이 항목엔 applicableQuizTypes 가 비어있어 퀴즈 생성 불가");
  }

  const existing = item.quizzes.map((q) => ({
    type: q.type,
    answer: q.payload.answer,
  }));

  const gen = await generateGrammarQuiz(
    {
      pattern: item.pattern,
      meaningKo: item.meaningsKo[0] ?? "",
      formation: item.formation,
      level: levelOf(item),
      applicableQuizTypes: applicable,
      existingQuizzes: existing,
    },
    tier,
  );

  const built = validateAndBuildQuiz(
    gen.result.type,
    gen.result.payload,
    applicable,
  );

  // Dedupe
  if (
    existing.some(
      (e) => e.type === built.type && e.answer === built.payload.answer,
    )
  ) {
    throw new Error("generated quiz duplicates an existing one");
  }

  const newQuiz: GrammarQuiz = {
    ...built,
    source: "generated",
    explanation: null,
  } as GrammarQuiz;

  const newQuizzes = [...item.quizzes, newQuiz];
  await d.grammarItems.update(itemId, { quizzes: newQuizzes });

  return {
    quiz: newQuiz,
    usage: { ...gen.usage, model: gen.modelUsed },
  };
}

/**
 * AI 가 던진 quiz 의 type 과 payload 를 검증하고 도메인 객체로 빌드.
 * 5개 타입 별로 필수 필드 / 마크업 / distractor 갯수 체크.
 */
function validateAndBuildQuiz(
  type: string,
  payload: Record<string, unknown>,
  applicable: readonly string[],
): GrammarQuiz {
  if (!VALID_QUIZ_TYPES.includes(type as GrammarQuizType)) {
    throw new Error(`unknown quiz type: ${type}`);
  }
  if (!applicable.includes(type)) {
    throw new Error(`type ${type} not in applicableQuizTypes`);
  }

  const ans = payload.answer;
  const distractors = payload.distractors;
  if (typeof ans !== "string" || !ans.trim()) {
    throw new Error("payload.answer missing");
  }
  if (
    !Array.isArray(distractors) ||
    distractors.length !== 3 ||
    distractors.some((d) => typeof d !== "string")
  ) {
    throw new Error("payload.distractors must be 3 strings");
  }
  if ((distractors as string[]).includes(ans)) {
    throw new Error("answer duplicates a distractor");
  }

  if (type === "conjugation") {
    if (typeof payload.dictForm !== "string" || !payload.dictForm) {
      throw new Error("conjugation: dictForm missing");
    }
    if (typeof payload.targetFormLabel !== "string") {
      throw new Error("conjugation: targetFormLabel missing");
    }
    if (typeof payload.group !== "string" || !VERB_GROUPS.has(payload.group)) {
      throw new Error(`conjugation: invalid group "${payload.group}"`);
    }
    return {
      type: "conjugation",
      payload: {
        dictForm: payload.dictForm,
        group: payload.group as never,
        targetFormLabel: payload.targetFormLabel,
        answer: ans,
        distractors: distractors as string[],
        hintKo: typeof payload.hintKo === "string" ? payload.hintKo : null,
      },
    };
  }

  if (type === "particle_blank" || type === "pattern_blank") {
    if (typeof payload.sentence !== "string") {
      throw new Error(`${type}: sentence missing`);
    }
    const tokens = parseSentence(payload.sentence, `add-grammar-quiz ${type}`);
    const targets = tokens.filter((t) => t.target);
    if (targets.length !== 1) {
      throw new Error(`${type}: sentence target count = ${targets.length}`);
    }
    if (targets[0].text !== ans) {
      throw new Error(
        `${type}: sentence target "${targets[0].text}" != answer "${ans}"`,
      );
    }
    if (typeof payload.translationKo !== "string") {
      throw new Error(`${type}: translationKo missing`);
    }
    return {
      type,
      payload: {
        sentence: payload.sentence,
        answer: ans,
        distractors: distractors as string[],
        translationKo: payload.translationKo,
      },
    };
  }

  if (type === "form_meaning") {
    if (typeof payload.prompt !== "string") {
      throw new Error("form_meaning: prompt missing");
    }
    parseSentence(payload.prompt, "add-grammar-quiz form_meaning prompt");
    if (
      payload.contextSentence !== null &&
      payload.contextSentence !== undefined &&
      typeof payload.contextSentence !== "string"
    ) {
      throw new Error("form_meaning: contextSentence must be string or null");
    }
    if (typeof payload.contextSentence === "string") {
      parseSentence(payload.contextSentence, "add-grammar-quiz form_meaning ctx");
    }
    if (/[{}]/.test(ans)) {
      throw new Error("form_meaning: answer must be plain Korean (no markup)");
    }
    for (const [i, d] of (distractors as string[]).entries()) {
      if (/[{}]/.test(d)) {
        throw new Error(
          `form_meaning: distractors[${i}] must be plain Korean (no markup)`,
        );
      }
    }
    return {
      type: "form_meaning",
      payload: {
        prompt: payload.prompt,
        contextSentence:
          typeof payload.contextSentence === "string"
            ? payload.contextSentence
            : null,
        answer: ans,
        distractors: distractors as string[],
      },
    };
  }

  // ko_to_jp_form
  if (typeof payload.ko !== "string") {
    throw new Error("ko_to_jp_form: ko missing");
  }
  // answer + distractors 모두 마크업 검증, target 1개씩
  const ansTokens = parseSentence(ans, "add-grammar-quiz ko-to-jp answer");
  if (ansTokens.filter((t) => t.target).length !== 1) {
    throw new Error("ko_to_jp_form: answer must contain one {{...}} target");
  }
  for (const [i, d] of (distractors as string[]).entries()) {
    const tokens = parseSentence(d, `add-grammar-quiz ko-to-jp distractor[${i}]`);
    if (tokens.filter((t) => t.target).length !== 1) {
      throw new Error(
        `ko_to_jp_form: distractors[${i}] must contain one {{...}} target`,
      );
    }
  }
  return {
    type: "ko_to_jp_form",
    payload: {
      ko: payload.ko,
      answer: ans,
      distractors: distractors as string[],
      hintKo: typeof payload.hintKo === "string" ? payload.hintKo : null,
    },
  };
}
