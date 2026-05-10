import type { GrammarQuiz } from "~/lib/idb/grammar-types";
import { ConjugationQuiz } from "./quizzes/ConjugationQuiz";
import { BlankQuiz } from "./quizzes/BlankQuiz";
import { FormMeaningQuiz } from "./quizzes/FormMeaningQuiz";
import { KoToJpFormQuiz } from "./quizzes/KoToJpFormQuiz";

export function GrammarQuizSection({
  quizzes,
  itemId,
  itemKey,
}: {
  quizzes: GrammarQuiz[];
  /** GrammarItem.id — quiz 해설 저장 시 사용 */
  itemId: number;
  /** 항목 변경 시 quiz 컴포넌트가 재마운트되도록 key 에 사용. */
  itemKey: number;
}) {
  if (quizzes.length === 0) return null;
  const total = quizzes.length;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        퀴즈 ({total})
      </h2>
      <div className="space-y-4">
        {quizzes.map((q, i) => {
          const step = `${i + 1} / ${total}`;
          const reactKey = `${itemKey}:${i}`;
          const initialExplanation = q.explanation ?? null;
          if (q.type === "conjugation") {
            return (
              <ConjugationQuiz
                key={reactKey}
                step={step}
                payload={q.payload}
                itemId={itemId}
                quizIndex={i}
                initialExplanation={initialExplanation}
              />
            );
          }
          if (q.type === "particle_blank") {
            return (
              <BlankQuiz
                key={reactKey}
                step={step}
                payload={q.payload}
                variant="particle"
                itemId={itemId}
                quizIndex={i}
                initialExplanation={initialExplanation}
              />
            );
          }
          if (q.type === "pattern_blank") {
            return (
              <BlankQuiz
                key={reactKey}
                step={step}
                payload={q.payload}
                variant="pattern"
                itemId={itemId}
                quizIndex={i}
                initialExplanation={initialExplanation}
              />
            );
          }
          if (q.type === "form_meaning") {
            return (
              <FormMeaningQuiz
                key={reactKey}
                step={step}
                payload={q.payload}
                itemId={itemId}
                quizIndex={i}
                initialExplanation={initialExplanation}
              />
            );
          }
          return (
            <KoToJpFormQuiz
              key={reactKey}
              step={step}
              payload={q.payload}
              itemId={itemId}
              quizIndex={i}
              initialExplanation={initialExplanation}
            />
          );
        })}
      </div>
    </div>
  );
}
