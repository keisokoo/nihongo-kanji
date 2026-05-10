import { db } from "./db";
import type { GrammarPackExport } from "./grammar-pack-export";

export type GrammarDeltaImportMode = "replace" | "merge";

export type GrammarDeltaImportResult = {
  packKey: string;
  mode: GrammarDeltaImportMode;
  attachedItemExplanations: number;
  attachedExampleExplanations: number;
  attachedQuizExplanations: number;
  unknownPatterns: string[];
  warnings: string[];
};

/**
 * 문법팩 delta (AI 해설) 적용.
 *
 * - replace: 시드 항목들의 기존 해설을 모두 비우고 → delta 적용
 * - merge: 기존 해설은 유지, delta 의 새 해설만 추가 (덮어쓰지 않음)
 */
export async function importGrammarDelta(
  input: GrammarPackExport,
  mode: GrammarDeltaImportMode,
): Promise<GrammarDeltaImportResult> {
  if (
    input.kind !== "jlpt-grammar-delta" &&
    input.kind !== "custom-grammar-full"
  ) {
    throw new Error(`expected grammar delta, got ${input.kind}`);
  }

  const d = db();
  const pack = await d.grammarPacks.get(input.key);
  if (!pack) {
    throw new Error(`grammar pack not found: ${input.key} — seed it first`);
  }

  const result: GrammarDeltaImportResult = {
    packKey: input.key,
    mode,
    attachedItemExplanations: 0,
    attachedExampleExplanations: 0,
    attachedQuizExplanations: 0,
    unknownPatterns: [],
    warnings: [],
  };

  const allItems = await d.grammarItems
    .where("packKey")
    .equals(input.key)
    .toArray();
  const itemsByPattern = new Map(allItems.map((it) => [it.pattern, it]));

  await d.transaction("rw", [d.grammarItems], async () => {
    // replace 모드: 모든 row 의 AI 해설을 먼저 비움.
    if (mode === "replace") {
      for (const it of allItems) {
        const newExamples = (it.examples ?? []).map((ex) => ({
          ...ex,
          explanation: null,
        }));
        const newQuizzes = (it.quizzes ?? []).map((q) => ({
          ...q,
          explanation: null,
        }));
        await d.grammarItems.update(it.id, {
          deepExplanation: null,
          examples: newExamples,
          quizzes: newQuizzes,
        });
      }
    }

    for (const exItem of input.items) {
      const target = itemsByPattern.get(exItem.pattern);
      if (!target) {
        result.unknownPatterns.push(exItem.pattern);
        continue;
      }

      // 최신 row 다시 읽기 (replace 처리 직후이므로)
      const fresh = await d.grammarItems.get(target.id);
      if (!fresh) continue;

      const updates: Partial<typeof fresh> = {};
      let dirty = false;

      // 항목 deep explanation
      if (exItem.deepExplanation) {
        if (mode === "merge" && fresh.deepExplanation) {
          // skip — 기존 유지
        } else {
          updates.deepExplanation = exItem.deepExplanation;
          result.attachedItemExplanations++;
          dirty = true;
        }
      }

      // examples
      if (exItem.examples.length > 0) {
        const newExamples = [...(fresh.examples ?? [])];
        for (const exExp of exItem.examples) {
          const target = newExamples[exExp.index];
          if (!target) {
            result.warnings.push(
              `${exItem.pattern}: example index ${exExp.index} out of range`,
            );
            continue;
          }
          // sentence 문자열로 매치 검증 (시드가 그동안 바뀌었는지)
          if (target.sentence !== exExp.sentence) {
            result.warnings.push(
              `${exItem.pattern}: example[${exExp.index}] sentence mismatch — skipping`,
            );
            continue;
          }
          if (mode === "merge" && target.explanation) continue;
          newExamples[exExp.index] = {
            ...target,
            explanation: exExp.explanation,
          };
          result.attachedExampleExplanations++;
          dirty = true;
        }
        updates.examples = newExamples;
      }

      // quizzes
      if (exItem.quizzes.length > 0) {
        const newQuizzes = [...(fresh.quizzes ?? [])];
        for (const qExp of exItem.quizzes) {
          const target = newQuizzes[qExp.index];
          if (!target) {
            result.warnings.push(
              `${exItem.pattern}: quiz index ${qExp.index} out of range`,
            );
            continue;
          }
          if (target.type !== qExp.type) {
            result.warnings.push(
              `${exItem.pattern}: quiz[${qExp.index}] type mismatch (seed=${target.type}, delta=${qExp.type}) — skipping`,
            );
            continue;
          }
          if (target.payload.answer !== qExp.answer) {
            result.warnings.push(
              `${exItem.pattern}: quiz[${qExp.index}] answer mismatch — skipping`,
            );
            continue;
          }
          if (mode === "merge" && target.explanation) continue;
          newQuizzes[qExp.index] = {
            ...target,
            explanation: qExp.explanation,
          };
          result.attachedQuizExplanations++;
          dirty = true;
        }
        updates.quizzes = newQuizzes;
      }

      if (dirty) {
        await d.grammarItems.update(fresh.id, updates);
      }
    }
  });

  return result;
}
