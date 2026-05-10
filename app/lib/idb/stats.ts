import { db } from "./db";

/**
 * 학습 통계 집계.
 *
 * - 시험 누적 (단어/한자읽기/문법 각각): 횟수 + 평균 정답률
 * - 최근 7일 일별 답한 문제 수
 * - AI 생성물 누적 (생성 단어, 생성 예문, 해설)
 * - AI 사용량 (호출수, 토큰, 비용 추정)
 * - 저장소 카운트 (한자/단어/문법/예문/시험)
 */

/**
 * 모델별 토큰당 가격 ($/1M tokens). cache_creation 은 일반 input 의 1.25x,
 * cache_read 는 0.1x. 알 수 없는 모델은 0 처리 (cost 계산에서 제외).
 */
const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  // Gemini 가격은 변동 폭이 크고 정확한 1M 단가 알기 어려움 — 대략값.
  "gemini-3.1-flash-lite": { input: 0.075, output: 0.3 },
  "gemini-3-flash-preview": { input: 0.15, output: 0.6 },
  // TTS 는 input/output 구분이 다른 식 — 보수적으로 input 기준 가격으로 추정.
  "gemini-3.1-flash-tts-preview": { input: 0.5, output: 0.5 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number,
): number {
  const p = PRICE_TABLE[model];
  if (!p) return 0;
  // cache_creation 은 input × 1.25, cache_read 는 input × 0.1
  const inputCost = (inputTokens / 1_000_000) * p.input;
  const cacheCreationCost = (cacheCreation / 1_000_000) * p.input * 1.25;
  const cacheReadCost = (cacheRead / 1_000_000) * p.input * 0.1;
  const outputCost = (outputTokens / 1_000_000) * p.output;
  return inputCost + cacheCreationCost + cacheReadCost + outputCost;
}

export type DailyCount = { date: string; answered: number; correct: number };

export type AiUsageStats = {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreation: number;
  totalCacheRead: number;
  totalCostUsd: number;
  /** 기능별 통계. */
  byFeature: Array<{
    feature: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
  /** 모델별 통계. */
  byModel: Array<{
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
  /** 최근 7일 일별 비용. */
  recentCost: Array<{ date: string; costUsd: number }>;
};

export type StatsData = {
  storage: {
    kanji: number;
    words: number;
    examples: number;
    grammarItems: number;
    grammarPacks: number;
  };
  tests: {
    word: { tests: number; answered: number; correct: number };
    grammar: { tests: number; answered: number; correct: number };
  };
  ai: {
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
  recent: DailyCount[];
  topWrong: Array<{
    kind: "word" | "grammar";
    label: string;
    wrongCount: number;
    totalCount: number;
  }>;
  aiUsage: AiUsageStats;
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function loadStatsData(): Promise<StatsData> {
  const d = db();

  // 1) Storage counts (most are cheap counts)
  const [
    kanjiCount,
    wordsCount,
    examplesCount,
    grammarItemsCount,
    grammarPacksCount,
  ] = await Promise.all([
    d.kanji.count(),
    d.words.count(),
    d.examples.count(),
    d.grammarItems.count(),
    d.grammarPacks.count(),
  ]);

  // 2) AI 생성물 — words.source === "generated", examples.source, etc.
  const [
    generatedWords,
    generatedExamples,
    wordExplanations,
    exampleExplanations,
  ] = await Promise.all([
    d.words.filter((w) => w.source === "generated").count(),
    d.examples.filter((e) => e.source === "generated").count(),
    d.words.filter((w) => w.explanation !== null).count(),
    d.examples.filter((e) => e.explanation !== null).count(),
  ]);

  // 문법 카운트는 row 안에 embedded array 라 toArray 후 집계
  let grammarItemExplanations = 0;
  let grammarExampleExplanations = 0;
  let grammarQuizExplanations = 0;
  let generatedGrammarExamples = 0;
  let generatedGrammarQuizzes = 0;
  await d.grammarItems.each((it) => {
    if (it.deepExplanation) grammarItemExplanations++;
    for (const ex of it.examples ?? []) {
      if (ex.explanation) grammarExampleExplanations++;
      if (ex.source === "generated") generatedGrammarExamples++;
    }
    for (const q of it.quizzes ?? []) {
      if (q.explanation) grammarQuizExplanations++;
      if (q.source === "generated") generatedGrammarQuizzes++;
    }
  });

  // 3) 시험 통계
  const [wordTestsCount, grammarTestsCount] = await Promise.all([
    d.wordTests.count(),
    d.grammarTests.count(),
  ]);

  let wordAnswered = 0;
  let wordCorrect = 0;
  let grammarAnswered = 0;
  let grammarCorrect = 0;

  const wordKindByTest = new Map<number, "meaning" | "reading">();
  for (const t of await d.wordTests.toArray()) {
    wordKindByTest.set(t.id, t.kind);
  }

  await d.wordTestItems.each((it) => {
    const kind = wordKindByTest.get(it.testId);
    if (!kind) return;
    const isAnswered =
      kind === "meaning"
        ? it.answeredAt !== null
        : it.pickedReading !== null && it.pickedMeaning !== null;
    const isCorrect =
      kind === "meaning"
        ? it.isCorrect === true
        : it.isCorrectReading === true && it.isCorrectMeaning === true;
    if (!isAnswered) return;
    wordAnswered++;
    if (isCorrect) wordCorrect++;
  });

  await d.grammarTestItems.each((it) => {
    if (it.answeredAt === null) return;
    grammarAnswered++;
    if (it.isCorrect === true) grammarCorrect++;
  });

  // 4) 최근 7일 일별 답한 문제 수
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: DailyCount[] = [];
  const dayMap = new Map<string, { answered: number; correct: number }>();
  for (let i = 6; i >= 0; i--) {
    const d0 = new Date(today);
    d0.setDate(today.getDate() - i);
    const key = formatDate(d0);
    days.push({ date: key, answered: 0, correct: 0 });
    dayMap.set(key, { answered: 0, correct: 0 });
  }

  // word test items - count answered ones in last 7 days
  await d.wordTestItems.each((it) => {
    if (!it.answeredAt) return;
    const at = new Date(it.answeredAt);
    at.setHours(0, 0, 0, 0);
    const key = formatDate(at);
    const bucket = dayMap.get(key);
    if (!bucket) return;
    bucket.answered++;
    const kind = wordKindByTest.get(it.testId);
    const isCorrect =
      kind === "meaning"
        ? it.isCorrect === true
        : it.isCorrectReading === true && it.isCorrectMeaning === true;
    if (isCorrect) bucket.correct++;
  });
  await d.grammarTestItems.each((it) => {
    if (!it.answeredAt) return;
    const at = new Date(it.answeredAt);
    at.setHours(0, 0, 0, 0);
    const key = formatDate(at);
    const bucket = dayMap.get(key);
    if (!bucket) return;
    bucket.answered++;
    if (it.isCorrect === true) bucket.correct++;
  });

  for (const day of days) {
    const b = dayMap.get(day.date);
    if (b) {
      day.answered = b.answered;
      day.correct = b.correct;
    }
  }

  // 5) 자주 틀리는 항목 top 5 (word + grammar)
  const wordWrongAgg = new Map<
    number,
    { word: string; wrong: number; total: number }
  >();
  await d.wordTestItems.each((it) => {
    if (!it.sourceWordId) return;
    const cur = wordWrongAgg.get(it.sourceWordId) ?? {
      word: it.word,
      wrong: 0,
      total: 0,
    };
    if (it.answeredAt) {
      cur.total++;
      const kind = wordKindByTest.get(it.testId);
      const isCorrect =
        kind === "meaning"
          ? it.isCorrect === true
          : it.isCorrectReading === true && it.isCorrectMeaning === true;
      if (!isCorrect) cur.wrong++;
    }
    wordWrongAgg.set(it.sourceWordId, cur);
  });

  const grammarWrongAgg = new Map<
    number,
    { pattern: string; wrong: number; total: number }
  >();
  await d.grammarTestItems.each((it) => {
    if (!it.sourceItemId) return;
    const cur = grammarWrongAgg.get(it.sourceItemId) ?? {
      pattern: it.pattern,
      wrong: 0,
      total: 0,
    };
    if (it.answeredAt) {
      cur.total++;
      if (it.isCorrect !== true) cur.wrong++;
    }
    grammarWrongAgg.set(it.sourceItemId, cur);
  });

  const topWrong: StatsData["topWrong"] = [];
  for (const [, v] of wordWrongAgg) {
    if (v.wrong > 0) {
      topWrong.push({
        kind: "word",
        label: v.word,
        wrongCount: v.wrong,
        totalCount: v.total,
      });
    }
  }
  for (const [, v] of grammarWrongAgg) {
    if (v.wrong > 0) {
      topWrong.push({
        kind: "grammar",
        label: v.pattern,
        wrongCount: v.wrong,
        totalCount: v.total,
      });
    }
  }
  topWrong.sort(
    (a, b) =>
      b.wrongCount - a.wrongCount ||
      b.wrongCount / b.totalCount - a.wrongCount / a.totalCount,
  );
  const topWrongCapped = topWrong.slice(0, 8);

  // 6) AI 사용량 로그 집계
  const aiUsage = await aggregateAiUsage();

  return {
    storage: {
      kanji: kanjiCount,
      words: wordsCount,
      examples: examplesCount,
      grammarItems: grammarItemsCount,
      grammarPacks: grammarPacksCount,
    },
    tests: {
      word: {
        tests: wordTestsCount,
        answered: wordAnswered,
        correct: wordCorrect,
      },
      grammar: {
        tests: grammarTestsCount,
        answered: grammarAnswered,
        correct: grammarCorrect,
      },
    },
    ai: {
      generatedWords,
      generatedExamples,
      wordExplanations,
      exampleExplanations,
      grammarItemExplanations,
      grammarExampleExplanations,
      grammarQuizExplanations,
      generatedGrammarExamples,
      generatedGrammarQuizzes,
    },
    recent: days,
    topWrong: topWrongCapped,
    aiUsage,
  };
}

async function aggregateAiUsage(): Promise<AiUsageStats> {
  const d = db();
  const rows = await d.aiUsageLog.toArray();
  const out: AiUsageStats = {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreation: 0,
    totalCacheRead: 0,
    totalCostUsd: 0,
    byFeature: [],
    byModel: [],
    recentCost: [],
  };

  if (rows.length === 0) {
    // 빈 7일 차트라도 채워둠 — UI 가 동일 모양 유지.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d0 = new Date(today);
      d0.setDate(today.getDate() - i);
      out.recentCost.push({ date: formatDate(d0), costUsd: 0 });
    }
    return out;
  }

  type Bucket = {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  const featureMap = new Map<string, Bucket>();
  const modelMap = new Map<string, Bucket>();
  const dayCostMap = new Map<string, number>();

  // 7일 buckets 미리
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d0 = new Date(today);
    d0.setDate(today.getDate() - i);
    dayCostMap.set(formatDate(d0), 0);
  }

  for (const r of rows) {
    out.totalCalls++;
    out.totalInputTokens += r.inputTokens;
    out.totalOutputTokens += r.outputTokens;
    out.totalCacheCreation += r.cacheCreationInputTokens;
    out.totalCacheRead += r.cacheReadInputTokens;
    const cost = estimateCostUsd(
      r.model,
      r.inputTokens,
      r.outputTokens,
      r.cacheCreationInputTokens,
      r.cacheReadInputTokens,
    );
    out.totalCostUsd += cost;

    const fb = featureMap.get(r.feature) ?? {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    fb.calls++;
    fb.inputTokens += r.inputTokens;
    fb.outputTokens += r.outputTokens;
    fb.costUsd += cost;
    featureMap.set(r.feature, fb);

    const mb = modelMap.get(r.model) ?? {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    mb.calls++;
    mb.inputTokens += r.inputTokens;
    mb.outputTokens += r.outputTokens;
    mb.costUsd += cost;
    modelMap.set(r.model, mb);

    // 7일 윈도 안에 있으면 일별 비용에 더함
    const ts = new Date(r.createdAt);
    ts.setHours(0, 0, 0, 0);
    const key = formatDate(ts);
    if (dayCostMap.has(key)) {
      dayCostMap.set(key, (dayCostMap.get(key) ?? 0) + cost);
    }
  }

  out.byFeature = [...featureMap.entries()]
    .map(([feature, b]) => ({ feature, ...b }))
    .sort((a, b) => b.costUsd - a.costUsd);
  out.byModel = [...modelMap.entries()]
    .map(([model, b]) => ({ model, ...b }))
    .sort((a, b) => b.costUsd - a.costUsd);
  out.recentCost = [...dayCostMap.entries()].map(([date, costUsd]) => ({
    date,
    costUsd,
  }));

  return out;
}
