import { db } from "./db";

/**
 * AI 가 생성·편집한 데이터의 일괄 삭제 / 초기화.
 *
 * 두 종류:
 * - 삭제: AI 가 새로 추가한 row 들 (source==="generated"). 시드 데이터는 무손상.
 * - 초기화: 시드 row 의 AI 해설 필드를 null 로. row 자체는 유지.
 */

// ─── A. 삭제 (generated rows) ───────────────────────────────────────────────

/**
 * AI 가 추가한 단어들을 삭제. 그 단어에 달린 예문도 cascade.
 * 시드 단어와 그 시드 예문은 무손상.
 */
export async function deleteGeneratedWords(): Promise<{
  words: number;
  examples: number;
}> {
  const d = db();
  let removedExamples = 0;
  let removedWords = 0;
  await d.transaction("rw", [d.words, d.examples], async () => {
    const aiWords = await d.words
      .filter((w) => w.source === "generated")
      .toArray();
    const ids = aiWords.map((w) => w.id);
    if (ids.length > 0) {
      removedExamples = await d.examples.where("wordId").anyOf(ids).delete();
      removedWords = await d.words.where("id").anyOf(ids).delete();
    }
  });
  return { words: removedWords, examples: removedExamples };
}

/**
 * AI 가 추가한 예문 (source==="generated") 만 삭제.
 * 단어는 유지. 시드 예문도 유지.
 */
export async function deleteGeneratedExamples(): Promise<number> {
  const d = db();
  return d.examples.filter((e) => e.source === "generated").delete();
}

/** 문법 추가 예문 (각 GrammarItem.examples 의 source==="generated") 만 삭제. */
export async function deleteGeneratedGrammarExamples(): Promise<number> {
  const d = db();
  let removed = 0;
  await d.transaction("rw", [d.grammarItems], async () => {
    const items = await d.grammarItems.toArray();
    for (const it of items) {
      const before = it.examples?.length ?? 0;
      const filtered = (it.examples ?? []).filter(
        (ex) => ex.source !== "generated",
      );
      if (filtered.length !== before) {
        removed += before - filtered.length;
        await d.grammarItems.update(it.id, { examples: filtered });
      }
    }
  });
  return removed;
}

/** 문법 추가 퀴즈만 삭제. */
export async function deleteGeneratedGrammarQuizzes(): Promise<number> {
  const d = db();
  let removed = 0;
  await d.transaction("rw", [d.grammarItems], async () => {
    const items = await d.grammarItems.toArray();
    for (const it of items) {
      const before = it.quizzes?.length ?? 0;
      const filtered = (it.quizzes ?? []).filter(
        (q) => q.source !== "generated",
      );
      if (filtered.length !== before) {
        removed += before - filtered.length;
        await d.grammarItems.update(it.id, { quizzes: filtered });
      }
    }
  });
  return removed;
}

// ─── B. 초기화 (clear AI explanations) ──────────────────────────────────────

export async function clearWordExplanations(): Promise<number> {
  const d = db();
  let cleared = 0;
  await d.transaction("rw", [d.words], async () => {
    const withExpl = await d.words
      .filter((w) => w.explanation !== null)
      .toArray();
    for (const w of withExpl) {
      await d.words.update(w.id, { explanation: null });
      cleared++;
    }
  });
  return cleared;
}

export async function clearExampleExplanations(): Promise<number> {
  const d = db();
  let cleared = 0;
  await d.transaction("rw", [d.examples], async () => {
    const withExpl = await d.examples
      .filter((e) => e.explanation !== null)
      .toArray();
    for (const e of withExpl) {
      await d.examples.update(e.id, { explanation: null });
      cleared++;
    }
  });
  return cleared;
}

export async function clearGrammarItemExplanations(): Promise<number> {
  const d = db();
  let cleared = 0;
  await d.transaction("rw", [d.grammarItems], async () => {
    const items = await d.grammarItems
      .filter((it) => it.deepExplanation !== null && it.deepExplanation !== undefined)
      .toArray();
    for (const it of items) {
      await d.grammarItems.update(it.id, { deepExplanation: null });
      cleared++;
    }
  });
  return cleared;
}

/** GrammarItem.examples[].explanation 을 모두 null. examples row 자체는 유지. */
export async function clearGrammarExampleExplanations(): Promise<number> {
  const d = db();
  let cleared = 0;
  await d.transaction("rw", [d.grammarItems], async () => {
    const items = await d.grammarItems.toArray();
    for (const it of items) {
      let changed = false;
      const newExamples = (it.examples ?? []).map((ex) => {
        if (ex.explanation) {
          changed = true;
          cleared++;
          return { ...ex, explanation: null };
        }
        return ex;
      });
      if (changed) {
        await d.grammarItems.update(it.id, { examples: newExamples });
      }
    }
  });
  return cleared;
}

/** GrammarItem.quizzes[].explanation 을 모두 null. quizzes row 자체는 유지. */
export async function clearGrammarQuizExplanations(): Promise<number> {
  const d = db();
  let cleared = 0;
  await d.transaction("rw", [d.grammarItems], async () => {
    const items = await d.grammarItems.toArray();
    for (const it of items) {
      let changed = false;
      const newQuizzes = (it.quizzes ?? []).map((q) => {
        if (q.explanation) {
          changed = true;
          cleared++;
          return { ...q, explanation: null };
        }
        return q;
      });
      if (changed) {
        await d.grammarItems.update(it.id, { quizzes: newQuizzes });
      }
    }
  });
  return cleared;
}
