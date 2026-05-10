import { db } from "./db";
import { JLPT_LEVELS, type Pack, type WordTestKind } from "./types";
import type { GrammarPack } from "./grammar-types";
import { getWeakItemCount } from "./review";
import { getFavoritesCount } from "./favorites";
import { loadAllFamilyCounts } from "./family";
import { RULE_FAMILIES, type RuleFamilyMeta } from "../grammar-families";

export type HomePack = Pack & {
  count: number;       // total kanji in pack
  wordCount: number;   // words eligible for tests (have meaningsKo)
};

export type HomeGrammarPack = GrammarPack & {
  count: number; // total items in pack
};

export type HomeTest = {
  id: number;
  name: string;
  /** "word" 면 kanji-pack 기반 단어/한자 시험, "grammar" 면 문법 시험. */
  testKind: "word" | "grammar";
  /** word test 일 때만 의미 있음 (meaning / reading). grammar 면 항상 "grammar" sentinel. */
  kind: WordTestKind | "grammar";
  total: number;
  sourcePacks: string[];
  createdAt: Date;
  answered: number;
  correct: number;
};

export type HomeFamily = RuleFamilyMeta & { count: number };

export type HomeFoundation = {
  id: number;
  packKey: string;
  pattern: string;
  meaningsKo: string[];
  ruleFamily: string | null;
};

export type HomeData = {
  jlpt: HomePack[];
  custom: HomePack[];
  grammar: HomeGrammarPack[];
  /** 멤버 1명 이상 있는 룰 패밀리만 surface. */
  families: HomeFamily[];
  /** isFoundation=true 인 grammarItems. 비어있으면 home 섹션 안 보임. */
  foundations: HomeFoundation[];
  tests: HomeTest[];
  weakItemCount: number;
  favoritesCount: number;
};

const JLPT_RANK = new Map<string, number>(
  JLPT_LEVELS.map((k, i) => [k, i] as const),
);

async function loadPacks(): Promise<{ jlpt: HomePack[]; custom: HomePack[] }> {
  const d = db();
  const allPacks = await d.packs.toArray();

  const allKanji = await d.kanji.toArray();
  const kanjiCountByPack = new Map<string, number>();
  for (const k of allKanji) {
    kanjiCountByPack.set(k.packKey, (kanjiCountByPack.get(k.packKey) ?? 0) + 1);
  }
  const kanjiIdToPack = new Map<number, string>(
    allKanji.map((k) => [k.id, k.packKey]),
  );

  // Words eligible: have at least one Korean meaning. Group their counts by pack.
  const wordCountByPack = new Map<string, number>();
  await d.words.each((w) => {
    if (!Array.isArray(w.meaningsKo) || w.meaningsKo.length === 0) return;
    const pk = kanjiIdToPack.get(w.kanjiId);
    if (!pk) return;
    wordCountByPack.set(pk, (wordCountByPack.get(pk) ?? 0) + 1);
  });

  function decorate(p: Pack): HomePack {
    return {
      ...p,
      count: kanjiCountByPack.get(p.key) ?? 0,
      wordCount: wordCountByPack.get(p.key) ?? 0,
    };
  }

  const jlpt = allPacks
    .filter((p) => p.kind === "jlpt")
    .sort((a, b) => (JLPT_RANK.get(a.key) ?? 99) - (JLPT_RANK.get(b.key) ?? 99))
    .map(decorate);

  const custom = allPacks
    .filter((p) => p.kind === "custom")
    .sort((a, b) => +a.createdAt - +b.createdAt)
    .map(decorate);

  return { jlpt, custom };
}

async function loadTests(): Promise<HomeTest[]> {
  const d = db();
  const tests = await d.wordTests.orderBy("createdAt").reverse().toArray();
  if (tests.length === 0) return [];

  // Aggregate per-test answered/correct based on kind.
  const allItems = await d.wordTestItems.toArray();
  const progress = new Map<number, { answered: number; correct: number }>();
  const kindByTest = new Map<number, WordTestKind>(
    tests.map((t) => [t.id, t.kind]),
  );

  for (const it of allItems) {
    const kind = kindByTest.get(it.testId);
    if (!kind) continue;
    const isAnswered =
      kind === "meaning"
        ? it.answeredAt !== null
        : it.pickedReading !== null && it.pickedMeaning !== null;
    const isCorrect =
      kind === "meaning"
        ? it.isCorrect === true
        : it.isCorrectReading === true && it.isCorrectMeaning === true;
    if (!isAnswered) continue;
    const cur = progress.get(it.testId) ?? { answered: 0, correct: 0 };
    cur.answered++;
    if (isCorrect) cur.correct++;
    progress.set(it.testId, cur);
  }

  return tests.map((t) => ({
    id: t.id,
    name: t.name,
    testKind: "word" as const,
    kind: t.kind,
    total: t.total,
    sourcePacks: t.sourcePacks,
    createdAt: t.createdAt,
    answered: progress.get(t.id)?.answered ?? 0,
    correct: progress.get(t.id)?.correct ?? 0,
  }));
}

async function loadGrammarTests(): Promise<HomeTest[]> {
  const d = db();
  const tests = await d.grammarTests.orderBy("createdAt").reverse().toArray();
  if (tests.length === 0) return [];

  const allItems = await d.grammarTestItems.toArray();
  const progress = new Map<number, { answered: number; correct: number }>();
  for (const it of allItems) {
    if (it.answeredAt === null) continue;
    const cur = progress.get(it.testId) ?? { answered: 0, correct: 0 };
    cur.answered++;
    if (it.isCorrect === true) cur.correct++;
    progress.set(it.testId, cur);
  }

  return tests.map((t) => ({
    id: t.id,
    name: t.name,
    testKind: "grammar" as const,
    kind: "grammar" as const,
    total: t.total,
    sourcePacks: t.sourcePacks,
    createdAt: t.createdAt,
    answered: progress.get(t.id)?.answered ?? 0,
    correct: progress.get(t.id)?.correct ?? 0,
  }));
}

async function loadFoundations(): Promise<HomeFoundation[]> {
  const d = db();
  const items: HomeFoundation[] = [];
  await d.grammarItems.each((it) => {
    if (it.isFoundation === true) {
      items.push({
        id: it.id,
        packKey: it.packKey,
        pattern: it.pattern,
        meaningsKo: it.meaningsKo,
        ruleFamily: it.ruleFamily ?? null,
      });
    }
  });
  // 룰 패밀리 order 로 정렬 (학습 순서 — ます → て → ない → た → ...). family 없으면 마지막.
  items.sort((a, b) => {
    const fa = a.ruleFamily
      ? (RULE_FAMILIES.find((f) => f.id === a.ruleFamily)?.order ?? 999)
      : 1000;
    const fb = b.ruleFamily
      ? (RULE_FAMILIES.find((f) => f.id === b.ruleFamily)?.order ?? 999)
      : 1000;
    if (fa !== fb) return fa - fb;
    return a.pattern.localeCompare(b.pattern);
  });
  return items;
}

async function loadGrammarPacks(): Promise<HomeGrammarPack[]> {
  const d = db();
  const packs = await d.grammarPacks.toArray();
  if (packs.length === 0) return [];

  const counts = new Map<string, number>();
  await d.grammarItems.each((it) => {
    counts.set(it.packKey, (counts.get(it.packKey) ?? 0) + 1);
  });

  // JLPT 문법팩 먼저 (N5 → N1), 커스텀 뒤에 (생성순)
  const jlpt = packs
    .filter((p) => p.kind === "jlpt-grammar")
    .sort((a, b) => {
      const ra = a.level ? (JLPT_RANK.get(a.level) ?? 99) : 99;
      const rb = b.level ? (JLPT_RANK.get(b.level) ?? 99) : 99;
      return ra - rb;
    });
  const custom = packs
    .filter((p) => p.kind === "custom-grammar")
    .sort((a, b) => +a.createdAt - +b.createdAt);

  return [...jlpt, ...custom].map((p) => ({
    ...p,
    count: counts.get(p.key) ?? 0,
  }));
}

export async function loadHomeData(): Promise<HomeData> {
  const [
    { jlpt, custom },
    grammar,
    wordTests,
    grammarTests,
    weakItemCount,
    favoritesCount,
    familyCounts,
    foundations,
  ] = await Promise.all([
    loadPacks(),
    loadGrammarPacks(),
    loadTests(),
    loadGrammarTests(),
    getWeakItemCount(),
    getFavoritesCount(),
    loadAllFamilyCounts(),
    loadFoundations(),
  ]);
  const tests = [...wordTests, ...grammarTests].sort(
    (a, b) => +b.createdAt - +a.createdAt,
  );
  const families = RULE_FAMILIES.map((f) => ({
    ...f,
    count: familyCounts.get(f.id) ?? 0,
  }))
    .filter((f) => f.count > 0)
    .sort((a, b) => a.order - b.order);
  return {
    jlpt,
    custom,
    grammar,
    families,
    foundations,
    tests,
    weakItemCount,
    favoritesCount,
  };
}
