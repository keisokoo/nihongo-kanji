import { db } from "./db";
import type {
  GrammarExampleExplanation,
  GrammarItemDeepExplanation,
  GrammarQuizExplanation,
} from "./grammar-types";

/**
 * 문법팩 delta export — 사용자가 AI 로 생성한 해설만 담음.
 *
 * 시드 자체 (pattern / examples / quizzes 본문) 는 모든 사용자가 공유하므로
 * 제외. delta 는 한 PC 에서 생성한 해설을 다른 PC 로 옮기거나 백업할 때 사용.
 */

export type GrammarExportItem = {
  /** 시드의 pattern 과 일치 — match key. */
  pattern: string;
  /** 시드의 position (no) — fallback match key. */
  position: number;
  deepExplanation: GrammarItemDeepExplanation | null;
  /** 인덱스가 시드와 동일하다고 가정. sentence 도 함께 보내서 match 검증. */
  examples: Array<{
    index: number;
    sentence: string;
    explanation: GrammarExampleExplanation;
  }>;
  quizzes: Array<{
    index: number;
    type: string; // 검증용
    /** 정답 — quiz.payload.answer (raw 그대로). 검증·매칭용. */
    answer: string;
    explanation: GrammarQuizExplanation;
  }>;
};

export type GrammarPackExport = {
  version: 1;
  kind: "jlpt-grammar-delta" | "custom-grammar-full";
  key: string;
  title: string;
  description: string | null;
  exportedAt: string;
  items: GrammarExportItem[];
};

export async function exportGrammarPack(
  packKey: string,
): Promise<GrammarPackExport> {
  const d = db();
  const pack = await d.grammarPacks.get(packKey);
  if (!pack) throw new Error(`grammar pack not found: ${packKey}`);

  const items = await d.grammarItems
    .where("packKey")
    .equals(packKey)
    .sortBy("position");

  const exportItems: GrammarExportItem[] = [];
  for (const it of items) {
    const exExamples = (it.examples ?? [])
      .map((ex, i) =>
        ex.explanation
          ? {
              index: i,
              sentence: ex.sentence,
              explanation: ex.explanation,
            }
          : null,
      )
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const exQuizzes = (it.quizzes ?? [])
      .map((q, i) =>
        q.explanation
          ? {
              index: i,
              type: q.type,
              answer: q.payload.answer,
              explanation: q.explanation,
            }
          : null,
      )
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (
      !it.deepExplanation &&
      exExamples.length === 0 &&
      exQuizzes.length === 0
    ) {
      continue; // skip — AI 데이터 없음
    }

    exportItems.push({
      pattern: it.pattern,
      position: it.position,
      deepExplanation: it.deepExplanation ?? null,
      examples: exExamples,
      quizzes: exQuizzes,
    });
  }

  return {
    version: 1,
    kind:
      pack.kind === "jlpt-grammar"
        ? "jlpt-grammar-delta"
        : "custom-grammar-full",
    key: pack.key,
    title: pack.title,
    description: pack.description,
    exportedAt: new Date().toISOString(),
    items: exportItems,
  };
}
