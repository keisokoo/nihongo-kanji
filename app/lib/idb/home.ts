import { db } from "./db";
import { JLPT_LEVELS, type Pack, type WordTestKind } from "./types";

export type HomePack = Pack & {
  count: number;       // total kanji in pack
  wordCount: number;   // words eligible for tests (have meaningsKo)
};

export type HomeTest = {
  id: number;
  name: string;
  kind: WordTestKind;
  total: number;
  sourcePacks: string[];
  createdAt: Date;
  answered: number;
  correct: number;
};

export type HomeData = {
  jlpt: HomePack[];
  custom: HomePack[];
  tests: HomeTest[];
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
    kind: t.kind,
    total: t.total,
    sourcePacks: t.sourcePacks,
    createdAt: t.createdAt,
    answered: progress.get(t.id)?.answered ?? 0,
    correct: progress.get(t.id)?.correct ?? 0,
  }));
}

export async function loadHomeData(): Promise<HomeData> {
  const [{ jlpt, custom }, tests] = await Promise.all([
    loadPacks(),
    loadTests(),
  ]);
  return { jlpt, custom, tests };
}
