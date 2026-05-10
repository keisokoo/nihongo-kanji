import { db } from "./db";
import type { GrammarQuiz } from "./grammar-types";
import type { GrammarPackExport } from "./grammar-pack-export";

export type GrammarDeltaImportMode = "replace" | "merge";

export type GrammarDeltaImportResult = {
  packKey: string;
  mode: GrammarDeltaImportMode;
  attachedItemExplanations: number;
  attachedExampleExplanations: number;
  attachedQuizExplanations: number;
  insertedGeneratedExamples: number;
  insertedGeneratedQuizzes: number;
  unknownPatterns: string[];
  warnings: string[];
};

/**
 * 문법팩 delta 적용.
 *
 * - replace:
 *     - 모든 항목의 deepExplanation, 시드 example/quiz 의 explanation 을 비움
 *     - 모든 항목의 source==="generated" 인 examples / quizzes 를 제거
 *     - 그 후 delta 적용 (item explanations 머지 + generated 추가)
 * - merge:
 *     - 기존 항목 해설은 유지, 비어있는 자리에만 채움
 *     - generated 는 dedupe (sentence 일치 / type+answer 일치) 해서 추가
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
    insertedGeneratedExamples: 0,
    insertedGeneratedQuizzes: 0,
    unknownPatterns: [],
    warnings: [],
  };

  const allItems = await d.grammarItems
    .where("packKey")
    .equals(input.key)
    .toArray();
  const itemsByPattern = new Map(allItems.map((it) => [it.pattern, it]));

  await d.transaction("rw", [d.grammarItems], async () => {
    if (mode === "replace") {
      for (const it of allItems) {
        const newExamples = (it.examples ?? [])
          .filter((ex) => ex.source !== "generated")
          .map((ex) => ({ ...ex, explanation: null }));
        const newQuizzes = (it.quizzes ?? [])
          .filter((q) => q.source !== "generated")
          .map((q) => ({ ...q, explanation: null }));
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

      const fresh = await d.grammarItems.get(target.id);
      if (!fresh) continue;

      const updates: Partial<typeof fresh> = {};
      let dirty = false;

      // 1) 항목 deep explanation
      if (exItem.deepExplanation) {
        if (mode === "merge" && fresh.deepExplanation) {
          // skip
        } else {
          updates.deepExplanation = exItem.deepExplanation;
          result.attachedItemExplanations++;
          dirty = true;
        }
      }

      // 2) 시드 example explanations
      let workingExamples = [...(fresh.examples ?? [])];
      for (const exExp of exItem.seedExampleExplanations) {
        const target = workingExamples[exExp.index];
        if (!target) {
          result.warnings.push(
            `${exItem.pattern}: example index ${exExp.index} out of range`,
          );
          continue;
        }
        if (target.sentence !== exExp.sentence) {
          result.warnings.push(
            `${exItem.pattern}: example[${exExp.index}] sentence mismatch — skipping`,
          );
          continue;
        }
        if (target.source === "generated") {
          result.warnings.push(
            `${exItem.pattern}: example[${exExp.index}] is generated — skipping (use generatedExamples)`,
          );
          continue;
        }
        if (mode === "merge" && target.explanation) continue;
        workingExamples[exExp.index] = {
          ...target,
          explanation: exExp.explanation,
        };
        result.attachedExampleExplanations++;
        dirty = true;
      }

      // 3) Generated examples 추가
      if (exItem.generatedExamples.length > 0) {
        const existingSentences = new Set(
          workingExamples.map((ex) => ex.sentence),
        );
        for (const newEx of exItem.generatedExamples) {
          if (existingSentences.has(newEx.sentence)) {
            // dedupe
            continue;
          }
          workingExamples.push({
            ...newEx,
            source: "generated",
          });
          existingSentences.add(newEx.sentence);
          result.insertedGeneratedExamples++;
          dirty = true;
        }
      }
      if (workingExamples !== fresh.examples) {
        updates.examples = workingExamples;
      }

      // 4) 시드 quiz explanations
      let workingQuizzes = [...(fresh.quizzes ?? [])];
      for (const qExp of exItem.seedQuizExplanations) {
        const target = workingQuizzes[qExp.index];
        if (!target) {
          result.warnings.push(
            `${exItem.pattern}: quiz index ${qExp.index} out of range`,
          );
          continue;
        }
        if (target.type !== qExp.type) {
          result.warnings.push(
            `${exItem.pattern}: quiz[${qExp.index}] type mismatch — skipping`,
          );
          continue;
        }
        if (target.payload.answer !== qExp.answer) {
          result.warnings.push(
            `${exItem.pattern}: quiz[${qExp.index}] answer mismatch — skipping`,
          );
          continue;
        }
        if (target.source === "generated") {
          result.warnings.push(
            `${exItem.pattern}: quiz[${qExp.index}] is generated — skipping (use generatedQuizzes)`,
          );
          continue;
        }
        if (mode === "merge" && target.explanation) continue;
        workingQuizzes[qExp.index] = {
          ...target,
          explanation: qExp.explanation,
        } as GrammarQuiz;
        result.attachedQuizExplanations++;
        dirty = true;
      }

      // 5) Generated quizzes 추가
      if (exItem.generatedQuizzes.length > 0) {
        const existingKeys = new Set(
          workingQuizzes.map((q) => `${q.type}|${q.payload.answer}`),
        );
        for (const newQ of exItem.generatedQuizzes) {
          const key = `${newQ.type}|${newQ.payload.answer}`;
          if (existingKeys.has(key)) continue;
          workingQuizzes.push({
            ...newQ,
            source: "generated",
          } as GrammarQuiz);
          existingKeys.add(key);
          result.insertedGeneratedQuizzes++;
          dirty = true;
        }
      }
      if (workingQuizzes !== fresh.quizzes) {
        updates.quizzes = workingQuizzes;
      }

      if (dirty) {
        await d.grammarItems.update(fresh.id, updates);
      }
    }
  });

  return result;
}

