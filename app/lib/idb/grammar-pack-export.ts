import { db } from "./db";
import type {
  GrammarExample,
  GrammarExampleExplanation,
  GrammarItemDeepExplanation,
  GrammarQuiz,
  GrammarQuizExplanation,
} from "./grammar-types";

/**
 * 문법팩 delta export — 사용자가 AI 로 추가한 데이터.
 *
 * 시드 자체 (pattern / 시드 examples / 시드 quizzes 본문) 는 모든 사용자가
 * 공유하므로 제외. delta 는 다음 두 종류를 모두 담음:
 *
 * 1) 시드 row 의 AI 해설 (deepExplanation, example.explanation, quiz.explanation)
 *    — 매칭 키: pattern + (sentence / type+answer)
 * 2) 사용자가 AI 로 추가한 새 row (source==="generated") — 통째로 export.
 *    — 그 자체로 삽입.
 */

export type GrammarExportItem = {
  /** 시드의 pattern 과 일치 — match key. */
  pattern: string;
  /** 시드의 position (no) — fallback. */
  position: number;
  /** 항목 deep explanation. */
  deepExplanation: GrammarItemDeepExplanation | null;
  /** 시드 예문에 붙인 해설. */
  seedExampleExplanations: Array<{
    /** 시드 examples 배열 내 인덱스. */
    index: number;
    /** 검증용 sentence 문자열. */
    sentence: string;
    explanation: GrammarExampleExplanation;
  }>;
  /** 시드 퀴즈에 붙인 해설. */
  seedQuizExplanations: Array<{
    index: number;
    type: string;
    answer: string;
    explanation: GrammarQuizExplanation;
  }>;
  /** 사용자가 AI 로 추가한 새 예문 (source==="generated"). 통째로. */
  generatedExamples: GrammarExample[];
  /** 사용자가 AI 로 추가한 새 퀴즈. 통째로. */
  generatedQuizzes: GrammarQuiz[];
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
    // 시드 vs 생성 구분 — source 가 "generated" 인 것만 generated 로 분리.
    const seedExamples = (it.examples ?? []).map((ex, i) => ({ ex, i }));
    const seedExampleExplanations: GrammarExportItem["seedExampleExplanations"] =
      [];
    const generatedExamples: GrammarExample[] = [];
    for (const { ex, i } of seedExamples) {
      if (ex.source === "generated") {
        generatedExamples.push(ex);
      } else if (ex.explanation) {
        seedExampleExplanations.push({
          index: i,
          sentence: ex.sentence,
          explanation: ex.explanation,
        });
      }
    }

    const seedQuizExplanations: GrammarExportItem["seedQuizExplanations"] = [];
    const generatedQuizzes: GrammarQuiz[] = [];
    for (const [i, q] of (it.quizzes ?? []).entries()) {
      if (q.source === "generated") {
        generatedQuizzes.push(q);
      } else if (q.explanation) {
        seedQuizExplanations.push({
          index: i,
          type: q.type,
          answer: q.payload.answer,
          explanation: q.explanation,
        });
      }
    }

    if (
      !it.deepExplanation &&
      seedExampleExplanations.length === 0 &&
      seedQuizExplanations.length === 0 &&
      generatedExamples.length === 0 &&
      generatedQuizzes.length === 0
    ) {
      continue; // skip — AI 데이터 없음
    }

    exportItems.push({
      pattern: it.pattern,
      position: it.position,
      deepExplanation: it.deepExplanation ?? null,
      seedExampleExplanations,
      seedQuizExplanations,
      generatedExamples,
      generatedQuizzes,
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
