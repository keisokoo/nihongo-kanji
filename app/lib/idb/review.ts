import { db } from "./db";
import type {
  WeakItemKind,
  WeakItemMastery,
  WordTestItem,
} from "./types";
import type { GrammarItem, GrammarTestItem } from "./grammar-types";

/**
 * 오답노트 (weak items) 데이터.
 *
 * 출처: 단어 시험 + 문법 시험에서 isCorrect=false 인 항목들.
 * 같은 source 가 여러 시험에서 틀렸으면 dedupe (가장 최근 틀림 사용).
 * 사용자가 "기억함" 처리한 건 weakItemMastery 에 저장 → 결과에서 제외.
 */

export type WeakWordItem = {
  kind: "word";
  sourceWordId: number;
  word: string;
  wordReading: string;
  meaningsKo: string[];
  /** 가장 최근에 틀린 시험에서의 mode (jp_to_ko / ko_to_jp / 한자 읽기 = null). */
  mode: WordTestItem["mode"];
  /** 가장 최근 틀린 시점. */
  lastWrongAt: Date;
  /** 출처 시험 이름 (라벨용). */
  lastTestName: string;
};

export type WeakGrammarItem = {
  kind: "grammar";
  sourceItemId: number;
  pattern: string;
  meaningsKo: string[];
  lastWrongAt: Date;
  lastTestName: string;
};

export type WeakItem = WeakWordItem | WeakGrammarItem;

export type ReviewData = {
  total: number;
  word: WeakWordItem[];
  grammar: WeakGrammarItem[];
};

export async function loadReviewData(): Promise<ReviewData> {
  const d = db();

  // 1) 단어 시험 — isCorrect=false 만, sourceWordId 있는 것만
  const [wordItems, wordTests] = await Promise.all([
    d.wordTestItems.filter((it) => it.isCorrect === false).toArray(),
    d.wordTests.toArray(),
  ]);
  const wordTestNameById = new Map<number, string>(
    wordTests.map((t) => [t.id, t.name]),
  );

  // sourceWordId 별 dedupe — 가장 최근 answeredAt 으로
  const wordByKey = new Map<number, WeakWordItem>();
  for (const it of wordItems) {
    if (it.sourceWordId == null) continue;
    if (!it.answeredAt) continue;
    const cur = wordByKey.get(it.sourceWordId);
    if (cur && +cur.lastWrongAt >= +it.answeredAt) continue;
    wordByKey.set(it.sourceWordId, {
      kind: "word",
      sourceWordId: it.sourceWordId,
      word: it.word,
      wordReading: it.wordReading,
      meaningsKo: it.meaningsKo,
      mode: it.mode,
      lastWrongAt: it.answeredAt,
      lastTestName: wordTestNameById.get(it.testId) ?? "",
    });
  }

  // 2) 문법 시험 — isCorrect=false 만
  const [grammarItems, grammarTests] = await Promise.all([
    d.grammarTestItems.filter((it) => it.isCorrect === false).toArray(),
    d.grammarTests.toArray(),
  ]);
  const grammarTestNameById = new Map<number, string>(
    grammarTests.map((t) => [t.id, t.name]),
  );

  const grammarByKey = new Map<number, WeakGrammarItem>();
  for (const it of grammarItems) {
    if (it.sourceItemId == null) continue;
    if (!it.answeredAt) continue;
    const cur = grammarByKey.get(it.sourceItemId);
    if (cur && +cur.lastWrongAt >= +it.answeredAt) continue;
    grammarByKey.set(it.sourceItemId, {
      kind: "grammar",
      sourceItemId: it.sourceItemId,
      pattern: it.pattern,
      meaningsKo: it.meaningsKo,
      lastWrongAt: it.answeredAt,
      lastTestName: grammarTestNameById.get(it.testId) ?? "",
    });
  }

  // 3) Subtract mastered
  const masteries = await d.weakItemMastery.toArray();
  for (const m of masteries) {
    if (m.testKind === "word") wordByKey.delete(m.sourceId);
    else grammarByKey.delete(m.sourceId);
  }

  const word = [...wordByKey.values()].sort(
    (a, b) => +b.lastWrongAt - +a.lastWrongAt,
  );
  const grammar = [...grammarByKey.values()].sort(
    (a, b) => +b.lastWrongAt - +a.lastWrongAt,
  );

  return { total: word.length + grammar.length, word, grammar };
}

export async function getWeakItemCount(): Promise<number> {
  const d = db();
  // mastered 건수 빼고 — 빠른 카운트만 필요.
  const [wrongWords, wrongGrammar, masteries] = await Promise.all([
    d.wordTestItems
      .filter((it) => it.isCorrect === false && it.sourceWordId !== null)
      .toArray(),
    d.grammarTestItems
      .filter((it) => it.isCorrect === false && it.sourceItemId !== null)
      .toArray(),
    d.weakItemMastery.toArray(),
  ]);
  const wordIds = new Set(
    wrongWords.map((it) => it.sourceWordId).filter((x): x is number => !!x),
  );
  const grammarIds = new Set(
    wrongGrammar.map((it) => it.sourceItemId).filter((x): x is number => !!x),
  );
  for (const m of masteries) {
    if (m.testKind === "word") wordIds.delete(m.sourceId);
    else grammarIds.delete(m.sourceId);
  }
  return wordIds.size + grammarIds.size;
}

export async function markMastered(
  testKind: WeakItemKind,
  sourceId: number,
): Promise<void> {
  const d = db();
  const row: WeakItemMastery = {
    testKind,
    sourceId,
    masteredAt: new Date(),
  };
  await d.weakItemMastery.put(row);
}

export async function unmarkMastered(
  testKind: WeakItemKind,
  sourceId: number,
): Promise<void> {
  const d = db();
  await d.weakItemMastery.delete([testKind, sourceId]);
}

export async function clearAllMastery(): Promise<void> {
  const d = db();
  await d.weakItemMastery.clear();
}

/**
 * 복습 세션 용 — 항목들의 source 를 IDB 에서 fresh 하게 가져옴.
 *
 * Word 의 경우: word + 그 단어의 examples 1개 (있으면) + 단어 메타.
 * Grammar 의 경우: 풀 GrammarItem (quizzes 포함).
 */
export type WordReviewBundle = {
  word: WeakWordItem;
  meaningPool: string[]; // distractor 풀 — 4지선다용
  jpPool: string[]; // distractor 풀 — ko_to_jp 4지선다용
};

export type GrammarReviewBundle = {
  weak: WeakGrammarItem;
  source: GrammarItem | null;
};

export async function buildReviewBundles(items: WeakItem[]): Promise<{
  word: WordReviewBundle[];
  grammar: GrammarReviewBundle[];
}> {
  const d = db();
  const result = {
    word: [] as WordReviewBundle[],
    grammar: [] as GrammarReviewBundle[],
  };

  // Word: distractor pool (다른 단어들의 meaningsKo 와 word).
  const weakWords = items.filter((x): x is WeakWordItem => x.kind === "word");
  if (weakWords.length > 0) {
    const wordIds = weakWords.map((w) => w.sourceWordId);
    // 같은 한자팩 limit 안 둠 — 어차피 review 는 단순한 4지선다라 풀 다양성이 더 중요
    const sample = await d.words
      .filter((w) => Array.isArray(w.meaningsKo) && w.meaningsKo.length > 0)
      .limit(800)
      .toArray();
    const pool = sample.map((w) => ({
      word: w.word,
      meaning: w.meaningsKo[0] ?? "",
      id: w.id,
    }));
    for (const w of weakWords) {
      const others = pool.filter((p) => p.id !== w.sourceWordId);
      result.word.push({
        word: w,
        meaningPool: [...new Set(others.map((p) => p.meaning).filter(Boolean))],
        jpPool: [...new Set(others.map((p) => p.word))],
      });
    }
    // suppress unused-var warning
    void wordIds;
  }

  // Grammar: source item 통째로
  const weakGrammar = items.filter(
    (x): x is WeakGrammarItem => x.kind === "grammar",
  );
  if (weakGrammar.length > 0) {
    const sourceIds = weakGrammar.map((g) => g.sourceItemId);
    const sources = await d.grammarItems.bulkGet(sourceIds);
    const byId = new Map<number, GrammarItem>();
    for (const s of sources) {
      if (s) byId.set(s.id, s);
    }
    for (const g of weakGrammar) {
      result.grammar.push({
        weak: g,
        source: byId.get(g.sourceItemId) ?? null,
      });
    }
  }

  return result;
}
