import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  kanji as kanjiTable,
  packs as packsTable,
  wordTests,
  wordTestItems,
  JLPT_LEVELS,
  type Pack,
  type WordTestKind,
} from "./db";

export type HomePack = Pack & {
  /** Total kanji in this pack. */
  count: number;
  /** Words eligible for the word-test (have ≥1 Korean meaning). */
  wordCount: number;
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
  const allPacks = await db.query.packs.findMany();

  const counts = await db
    .select({
      packKey: kanjiTable.packKey,
      count: sql<number>`count(*)::int`,
    })
    .from(kanjiTable)
    .groupBy(kanjiTable.packKey);
  const countByKey = new Map(counts.map((c) => [c.packKey, c.count]));

  const wordCountRows = (await db.execute(sql`
    SELECT k.pack_key AS pack_key, COUNT(w.id)::int AS word_count
    FROM words w
    JOIN kanji k ON k.id = w.kanji_id
    WHERE jsonb_array_length(w.meanings_ko) > 0
    GROUP BY k.pack_key
  `)) as unknown as Array<{ pack_key: string; word_count: number }>;
  const wordCountByKey = new Map<string, number>(
    wordCountRows.map((r) => [r.pack_key, r.word_count]),
  );

  function decorate(p: Pack): HomePack {
    return {
      ...p,
      count: countByKey.get(p.key) ?? 0,
      wordCount: wordCountByKey.get(p.key) ?? 0,
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
  const tests = await db
    .select()
    .from(wordTests)
    .orderBy(desc(wordTests.createdAt));

  if (tests.length === 0) return [];

  // answered: meaning kind = answered_at set; reading kind = both sub-picks set.
  // correct:  meaning kind = is_correct; reading kind = both sub-correct.
  const progressRows = await db
    .select({
      testId: wordTestItems.testId,
      answered: sql<number>`
        count(*) FILTER (WHERE
          (${wordTests.kind} = 'meaning' AND ${wordTestItems.answeredAt} IS NOT NULL)
          OR
          (${wordTests.kind} = 'reading'
            AND ${wordTestItems.pickedReading} IS NOT NULL
            AND ${wordTestItems.pickedMeaning} IS NOT NULL)
        )::int`,
      correct: sql<number>`
        count(*) FILTER (WHERE
          (${wordTests.kind} = 'meaning' AND ${wordTestItems.isCorrect} = true)
          OR
          (${wordTests.kind} = 'reading'
            AND ${wordTestItems.isCorrectReading} = true
            AND ${wordTestItems.isCorrectMeaning} = true)
        )::int`,
    })
    .from(wordTestItems)
    .innerJoin(wordTests, eq(wordTestItems.testId, wordTests.id))
    .groupBy(wordTestItems.testId);

  const progressById = new Map(
    progressRows.map((r) => [
      r.testId,
      { answered: r.answered, correct: r.correct },
    ]),
  );

  return tests.map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    total: t.total,
    sourcePacks: t.sourcePacks,
    createdAt: t.createdAt,
    answered: progressById.get(t.id)?.answered ?? 0,
    correct: progressById.get(t.id)?.correct ?? 0,
  }));
}

export async function loadHomeData(): Promise<HomeData> {
  const [{ jlpt, custom }, tests] = await Promise.all([loadPacks(), loadTests()]);
  return { jlpt, custom, tests };
}
