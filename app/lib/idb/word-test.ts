import { db } from "./db";
import type {
  Example,
  Kanji,
  Reading,
  ReadingSubPick,
  WordTestKind,
  WordTestMode,
} from "./types";

export type CreateTestInput = {
  name: string;
  kind: WordTestKind;
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

  const d = db();

  // Eligible: kanji.packKey ∈ packKeys, word.meaningsKo non-empty.
  const kanjiInPack = await d.kanji
    .where("packKey")
    .anyOf(packKeys)
    .toArray();
  const kanjiIdToPack = new Map<number, string>(
    kanjiInPack.map((k) => [k.id, k.packKey]),
  );
  const kanjiIds = kanjiInPack.map((k) => k.id);

  const wordsInPack =
    kanjiIds.length === 0
      ? []
      : await d.words.where("kanjiId").anyOf(kanjiIds).toArray();

  const eligible = wordsInPack
    .filter((w) => Array.isArray(w.meaningsKo) && w.meaningsKo.length > 0)
    .map((w) => ({
      id: w.id,
      word: w.word,
      wordReading: w.wordReading,
      meaningsKo: w.meaningsKo,
      packKey: kanjiIdToPack.get(w.kanjiId)!,
    }));

  // Sample per pack.
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
    sampled.push(...shuffle(pool).slice(0, want));
  }

  if (sampled.length === 0) {
    throw new Error("선택한 팩에 단어가 없습니다 (또는 한국어 뜻 미저장).");
  }

  const ordered = shuffle(sampled);

  let testId!: number;

  await d.transaction("rw", [d.wordTests, d.wordTestItems], async () => {
    testId = (await d.wordTests.add({
      name,
      kind,
      sourcePacks: packKeys,
      total: ordered.length,
      createdAt: new Date(),
    } as never)) as number;

    await d.wordTestItems.bulkAdd(
      ordered.map((w, i) => ({
        testId,
        position: i,
        sourceWordId: w.id,
        word: w.word,
        wordReading: w.wordReading,
        meaningsKo: w.meaningsKo,
        mode: kind === "meaning" ? pickMode() : null,
        pickedChoice: null,
        isCorrect: null,
        pickedReading: null,
        isCorrectReading: null,
        pickedMeaning: null,
        isCorrectMeaning: null,
        answeredAt: null,
      })) as never,
    );
  });

  return { testId, total: ordered.length };
}

export async function deleteWordTest(id: number): Promise<void> {
  if (!Number.isFinite(id)) throw new Error("testId required");
  const d = db();
  await d.transaction("rw", [d.wordTests, d.wordTestItems], async () => {
    await d.wordTestItems.where("testId").equals(id).delete();
    await d.wordTests.delete(id);
  });
}

export type AnswerInput = {
  itemId: number;
  choice: string;
  /** Required for kind="reading"; ignored for "meaning". */
  subPick?: ReadingSubPick;
};

export type AnswerResult = {
  isCorrect: boolean;
  correctChoices: string[];
  itemAnsweredAt: string | null;
};

export async function answerItem(input: AnswerInput): Promise<AnswerResult> {
  const itemId = Number(input.itemId);
  if (!Number.isFinite(itemId)) throw new Error("itemId required");

  const d = db();
  const item = await d.wordTestItems.get(itemId);
  if (!item) throw new Error("item not found");
  const test = await d.wordTests.get(item.testId);
  if (!test) throw new Error("parent test not found");

  if (test.kind === "meaning") {
    const correctChoices =
      item.mode === "ko_to_jp" ? [item.word] : item.meaningsKo;
    const isCorrect = correctChoices.includes(input.choice);
    const now = new Date();
    await d.wordTestItems.update(itemId, {
      pickedChoice: input.choice,
      isCorrect,
      answeredAt: now,
    });
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
    await d.wordTestItems.update(itemId, {
      pickedReading: input.choice,
      isCorrectReading: isCorrect,
      ...(fullyDone ? { answeredAt: now } : {}),
    });
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
  await d.wordTestItems.update(itemId, {
    pickedMeaning: input.choice,
    isCorrectMeaning: isCorrect,
    ...(fullyDone ? { answeredAt: now } : {}),
  });
  return {
    isCorrect,
    correctChoices,
    itemAnsweredAt: now ? now.toISOString() : null,
  };
}

export async function loadExamplesForSourceWords(
  sourceWordIds: number[],
): Promise<Map<number, Example>> {
  const map = new Map<number, Example>();
  if (sourceWordIds.length === 0) return map;
  const rows = await db()
    .examples.where("wordId")
    .anyOf(sourceWordIds)
    .sortBy("id");
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

export async function loadFocusKanjiForSourceWords(
  sourceWordIds: number[],
): Promise<Map<number, FocusKanji>> {
  const map = new Map<number, FocusKanji>();
  if (sourceWordIds.length === 0) return map;

  const d = db();
  const words = await d.words.bulkGet(sourceWordIds);
  const valid = words.filter((w): w is NonNullable<typeof w> => !!w);

  const kanjiIds = [...new Set(valid.map((w) => w.kanjiId))];
  if (kanjiIds.length === 0) return map;
  const kanjiList = await d.kanji.bulkGet(kanjiIds);
  const kanjiById = new Map<number, Kanji>(
    kanjiList.filter((k): k is Kanji => !!k).map((k) => [k.id, k]),
  );

  const readingRows = await d.readings
    .where("kanjiId")
    .anyOf(kanjiIds)
    .sortBy("id");
  const readingsByKanjiId = new Map<number, Reading[]>();
  for (const r of readingRows) {
    const list = readingsByKanjiId.get(r.kanjiId) ?? [];
    list.push(r);
    readingsByKanjiId.set(r.kanjiId, list);
  }

  for (const w of valid) {
    const k = kanjiById.get(w.kanjiId);
    if (!k) continue;
    map.set(w.id, {
      id: k.id,
      character: k.character,
      packKey: k.packKey,
      meaningKo: k.meaningKo,
      strokeCount: k.strokeCount,
      readings: readingsByKanjiId.get(k.id) ?? [],
    });
  }
  return map;
}
