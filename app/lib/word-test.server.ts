import { asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  examples as examplesTable,
  kanji as kanjiTable,
  readings as readingsTable,
  words as wordsTable,
  wordTests,
  wordTestItems,
  type Example,
  type Kanji,
  type Reading,
  type ReadingSubPick,
  type WordTestKind,
  type WordTestMode,
} from "./db";

export type CreateTestInput = {
  name: string;
  kind: WordTestKind;
  /**
   * For each selected pack, the number of words to draw.
   * `count: "all"` (or `>= pack word count`) draws every eligible word.
   */
  packs: Array<{ packKey: string; count: number | "all" }>;
};

export type CreateTestResult = {
  testId: number;
  total: number;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickMode(): WordTestMode {
  return Math.random() < 0.5 ? "jp_to_ko" : "ko_to_jp";
}

export async function createWordTest(
  input: CreateTestInput,
): Promise<CreateTestResult> {
  const name = input.name?.trim();
  if (!name) throw new Error("name is required");
  if (!Array.isArray(input.packs) || input.packs.length === 0) {
    throw new Error("at least one pack must be selected");
  }
  const kind: WordTestKind =
    input.kind === "reading" ? "reading" : "meaning";

  const packKeys = [...new Set(input.packs.map((p) => p.packKey))];
  const countByPack = new Map(
    input.packs.map((p) => [p.packKey, p.count] as const),
  );

  const candidates = await db
    .select({
      id: wordsTable.id,
      word: wordsTable.word,
      wordReading: wordsTable.wordReading,
      meaningsKo: wordsTable.meaningsKo,
      packKey: kanjiTable.packKey,
    })
    .from(wordsTable)
    .innerJoin(kanjiTable, eq(wordsTable.kanjiId, kanjiTable.id))
    .where(inArray(kanjiTable.packKey, packKeys));

  const eligible = candidates.filter(
    (w) => Array.isArray(w.meaningsKo) && w.meaningsKo.length > 0,
  );

  const byPack = new Map<string, typeof eligible>();
  for (const w of eligible) {
    const list = byPack.get(w.packKey) ?? [];
    list.push(w);
    byPack.set(w.packKey, list);
  }

  const sampled: typeof eligible = [];
  for (const packKey of packKeys) {
    const pool = byPack.get(packKey) ?? [];
    const requested = countByPack.get(packKey) ?? "all";
    const want =
      requested === "all" ? pool.length : Math.min(requested, pool.length);
    const shuffled = shuffle(pool);
    sampled.push(...shuffled.slice(0, want));
  }

  if (sampled.length === 0) {
    throw new Error("선택한 팩에 단어가 없습니다 (또는 한국어 뜻 미저장).");
  }

  const ordered = shuffle(sampled);

  const [test] = await db
    .insert(wordTests)
    .values({
      name,
      kind,
      sourcePacks: packKeys,
      total: ordered.length,
    })
    .returning();

  await db.insert(wordTestItems).values(
    ordered.map((w, i) => ({
      testId: test.id,
      position: i,
      sourceWordId: w.id,
      word: w.word,
      wordReading: w.wordReading,
      meaningsKo: w.meaningsKo,
      // mode is only relevant for kind="meaning"; null for reading kind.
      mode: kind === "meaning" ? pickMode() : null,
    })),
  );

  return { testId: test.id, total: ordered.length };
}

export type AnswerInput = {
  itemId: number;
  choice: string;
  /** Required for kind="reading"; ignored for "meaning". */
  subPick?: ReadingSubPick;
};

export type AnswerResult = {
  isCorrect: boolean;
  /** All correct answers for the just-answered question. */
  correctChoices: string[];
  /** True only when the whole item is now done. */
  itemAnsweredAt: string | null;
};

export async function answerItem(input: AnswerInput): Promise<AnswerResult> {
  const itemId = Number(input.itemId);
  if (!Number.isFinite(itemId)) throw new Error("itemId required");

  const item = await db.query.wordTestItems.findFirst({
    where: eq(wordTestItems.id, itemId),
  });
  if (!item) throw new Error("item not found");

  const test = await db.query.wordTests.findFirst({
    where: eq(wordTests.id, item.testId),
  });
  if (!test) throw new Error("parent test not found");

  if (test.kind === "meaning") {
    const correctChoices =
      item.mode === "ko_to_jp" ? [item.word] : item.meaningsKo;
    const isCorrect = correctChoices.includes(input.choice);
    const now = new Date();
    await db
      .update(wordTestItems)
      .set({
        pickedChoice: input.choice,
        isCorrect,
        answeredAt: now,
      })
      .where(eq(wordTestItems.id, itemId));
    return {
      isCorrect,
      correctChoices,
      itemAnsweredAt: now.toISOString(),
    };
  }

  // kind === "reading"
  if (input.subPick !== "reading" && input.subPick !== "meaning") {
    throw new Error("subPick required for reading kind");
  }

  if (input.subPick === "reading") {
    const correctChoices = [item.wordReading];
    const isCorrect = correctChoices.includes(input.choice);
    const fullyDone = item.pickedMeaning !== null;
    const now = fullyDone ? new Date() : null;
    await db
      .update(wordTestItems)
      .set({
        pickedReading: input.choice,
        isCorrectReading: isCorrect,
        ...(fullyDone ? { answeredAt: now } : {}),
      })
      .where(eq(wordTestItems.id, itemId));
    return {
      isCorrect,
      correctChoices,
      itemAnsweredAt: now ? now.toISOString() : null,
    };
  }

  // subPick === "meaning"
  const correctChoices = item.meaningsKo;
  const isCorrect = correctChoices.includes(input.choice);
  const fullyDone = item.pickedReading !== null;
  const now = fullyDone ? new Date() : null;
  await db
    .update(wordTestItems)
    .set({
      pickedMeaning: input.choice,
      isCorrectMeaning: isCorrect,
      ...(fullyDone ? { answeredAt: now } : {}),
    })
    .where(eq(wordTestItems.id, itemId));
  return {
    isCorrect,
    correctChoices,
    itemAnsweredAt: now ? now.toISOString() : null,
  };
}

/**
 * For reading-kind tests, fetch the first example sentence per source word
 * (live — not snapshotted). Returns a Map keyed by sourceWordId.
 */
export async function loadExamplesForSourceWords(
  sourceWordIds: number[],
): Promise<Map<number, Example>> {
  const map = new Map<number, Example>();
  if (sourceWordIds.length === 0) return map;
  const rows = await db
    .select()
    .from(examplesTable)
    .where(inArray(examplesTable.wordId, sourceWordIds))
    .orderBy(asc(examplesTable.wordId), asc(examplesTable.id));
  for (const row of rows) {
    if (!map.has(row.wordId)) map.set(row.wordId, row);
  }
  return map;
}

export type FocusKanji = Pick<
  Kanji,
  "id" | "character" | "packKey" | "meaningKo" | "strokeCount"
> & {
  readings: Reading[];
};

/**
 * For reading-kind tests, fetch each source word's focus kanji + its readings
 * (live — same data as the word pack's KanjiCard). Returns a Map keyed by
 * sourceWordId.
 */
export async function loadFocusKanjiForSourceWords(
  sourceWordIds: number[],
): Promise<Map<number, FocusKanji>> {
  const map = new Map<number, FocusKanji>();
  if (sourceWordIds.length === 0) return map;

  const wordKanjiRows = await db
    .select({
      wordId: wordsTable.id,
      id: kanjiTable.id,
      character: kanjiTable.character,
      packKey: kanjiTable.packKey,
      meaningKo: kanjiTable.meaningKo,
      strokeCount: kanjiTable.strokeCount,
    })
    .from(wordsTable)
    .innerJoin(kanjiTable, eq(wordsTable.kanjiId, kanjiTable.id))
    .where(inArray(wordsTable.id, sourceWordIds));

  if (wordKanjiRows.length === 0) return map;

  const kanjiIds = [...new Set(wordKanjiRows.map((r) => r.id))];
  const readingRows = await db
    .select()
    .from(readingsTable)
    .where(inArray(readingsTable.kanjiId, kanjiIds))
    .orderBy(asc(readingsTable.kanjiId), asc(readingsTable.id));

  const readingsByKanjiId = new Map<number, Reading[]>();
  for (const r of readingRows) {
    const list = readingsByKanjiId.get(r.kanjiId) ?? [];
    list.push(r);
    readingsByKanjiId.set(r.kanjiId, list);
  }

  for (const r of wordKanjiRows) {
    map.set(r.wordId, {
      id: r.id,
      character: r.character,
      packKey: r.packKey,
      meaningKo: r.meaningKo,
      strokeCount: r.strokeCount,
      readings: readingsByKanjiId.get(r.id) ?? [],
    });
  }
  return map;
}
