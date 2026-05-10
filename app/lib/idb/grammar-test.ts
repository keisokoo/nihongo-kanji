import { db } from "./db";
import type {
  GrammarItem,
  GrammarQuiz,
  GrammarTestItem,
} from "./grammar-types";

export type CreateGrammarTestInput = {
  name: string;
  packs: Array<{ packKey: string; count: number | "all" }>;
};

export type CreateGrammarTestResult = {
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

export async function createGrammarTest(
  input: CreateGrammarTestInput,
): Promise<CreateGrammarTestResult> {
  const name = input.name?.trim();
  if (!name) throw new Error("name is required");
  if (!Array.isArray(input.packs) || input.packs.length === 0) {
    throw new Error("at least one pack must be selected");
  }

  const packKeys = [...new Set(input.packs.map((p) => p.packKey))];
  const countByPack = new Map(
    input.packs.map((p) => [p.packKey, p.count] as const),
  );

  const d = db();

  const itemsInPacks = await d.grammarItems
    .where("packKey")
    .anyOf(packKeys)
    .toArray();

  // quiz 가 1개 이상 있는 항목만 시험 후보
  const eligible = itemsInPacks.filter((it) => (it.quizzes ?? []).length > 0);

  // pack 별로 그룹핑
  const byPack = new Map<string, GrammarItem[]>();
  for (const it of eligible) {
    const list = byPack.get(it.packKey) ?? [];
    list.push(it);
    byPack.set(it.packKey, list);
  }

  // 각 pack 에서 요청 개수만큼 sample
  const sampled: GrammarItem[] = [];
  for (const packKey of packKeys) {
    const pool = byPack.get(packKey) ?? [];
    const requested = countByPack.get(packKey) ?? "all";
    const want =
      requested === "all" ? pool.length : Math.min(requested, pool.length);
    sampled.push(...shuffle(pool).slice(0, want));
  }

  if (sampled.length === 0) {
    throw new Error("선택한 팩에 시험 가능한 문법 항목이 없습니다.");
  }

  const ordered = shuffle(sampled);

  let testId!: number;
  await d.transaction(
    "rw",
    [d.grammarTests, d.grammarTestItems],
    async () => {
      testId = (await d.grammarTests.add({
        name,
        sourcePacks: packKeys,
        total: ordered.length,
        createdAt: new Date(),
      } as never)) as number;

      await d.grammarTestItems.bulkAdd(
        ordered.map((it, i) => {
          // 각 항목당 quiz 1개 무작위 snapshot
          const qIdx = Math.floor(Math.random() * it.quizzes.length);
          const quiz = it.quizzes[qIdx];
          // 깊은 복사 (snapshot 이 source 변경에 영향받지 않도록)
          const snapshot = structuredClone(quiz) as GrammarQuiz;
          // explanation 은 시점에 따라 갱신 가능하니 snapshot 에서 제외 →
          // 시험 화면에서 source 가 살아있으면 fresh 로 보여주는 게 더 좋음
          snapshot.explanation = undefined;
          return {
            testId,
            position: i,
            sourceItemId: it.id,
            sourceQuizIndex: qIdx,
            quizSnapshot: snapshot,
            pattern: it.pattern,
            meaningsKo: [...it.meaningsKo],
            pickedChoice: null,
            isCorrect: null,
            answeredAt: null,
          };
        }) as never,
      );
    },
  );

  return { testId, total: ordered.length };
}

export async function deleteGrammarTest(id: number): Promise<void> {
  if (!Number.isFinite(id)) throw new Error("testId required");
  const d = db();
  await d.transaction(
    "rw",
    [d.grammarTests, d.grammarTestItems],
    async () => {
      await d.grammarTestItems.where("testId").equals(id).delete();
      await d.grammarTests.delete(id);
    },
  );
}

export type AnswerGrammarTestInput = {
  itemId: number;
  choice: string;
};

export type AnswerGrammarTestResult = {
  isCorrect: boolean;
  correctChoices: string[];
  itemAnsweredAt: string | null;
};

/**
 * 정답 판정 + 항목 row 업데이트. 답안의 정답성은 quiz type 별로 다름:
 * - conjugation / blank / form_meaning / ko_to_jp_form 모두 payload.answer 와 정확 일치
 *
 * ko_to_jp_form 의 경우 사용자가 마크업 포함 문자열을 picked 했을 가능성이
 * 있으니 (UI 가 마크업 그대로 전달) plain text 비교는 하지 않고 raw 그대로
 * 비교한다. UI 가 raw answer 를 픽 키로 사용해야 함.
 */
export async function answerGrammarTestItem(
  input: AnswerGrammarTestInput,
): Promise<AnswerGrammarTestResult> {
  const itemId = Number(input.itemId);
  if (!Number.isFinite(itemId)) throw new Error("itemId required");

  const d = db();
  const item = await d.grammarTestItems.get(itemId);
  if (!item) throw new Error("test item not found");

  const quiz = item.quizSnapshot;
  const correctChoices = [quiz.payload.answer];
  const isCorrect = input.choice === quiz.payload.answer;
  const answeredAt = new Date();

  await d.grammarTestItems.update(itemId, {
    pickedChoice: input.choice,
    isCorrect,
    answeredAt,
  });

  return {
    isCorrect,
    correctChoices,
    itemAnsweredAt: answeredAt.toISOString(),
  };
}

/**
 * 시험 페이지 loader 용 — quiz 의 explanation 은 source item 에서 fresh 로
 * 가져옴 (시험 만든 후 사용자가 "📖 해설" 으로 생성했을 수 있음).
 */
export async function loadFreshExplanationsForTest(
  items: GrammarTestItem[],
): Promise<Map<number, GrammarQuiz["explanation"]>> {
  const d = db();
  const sourceIds = [
    ...new Set(items.map((it) => it.sourceItemId).filter((x): x is number => x !== null)),
  ];
  if (sourceIds.length === 0) return new Map();
  const sources = await d.grammarItems.bulkGet(sourceIds);
  const byId = new Map<number, GrammarItem>();
  for (const s of sources) {
    if (s) byId.set(s.id, s);
  }
  const out = new Map<number, GrammarQuiz["explanation"]>();
  for (const it of items) {
    if (it.sourceItemId === null) continue;
    const src = byId.get(it.sourceItemId);
    if (!src) continue;
    const q = src.quizzes[it.sourceQuizIndex];
    if (q?.explanation) out.set(it.id, q.explanation);
  }
  return out;
}

