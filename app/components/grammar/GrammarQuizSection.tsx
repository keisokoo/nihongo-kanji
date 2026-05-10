import { useState } from "react";
import { useRevalidator } from "react-router";
import type { GrammarQuiz } from "~/lib/idb/grammar-types";
import { addGrammarQuiz } from "~/lib/idb/grammar-actions";
import { useAiAvailability } from "~/lib/idb/use-ai-availability";
import { showUsageToast } from "~/components/Toast";
import { Spinner } from "~/components/Spinner";
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
  const total = quizzes.length;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          퀴즈 ({total})
        </h2>
        <AddQuizButton itemId={itemId} />
      </div>
      {total === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400 dark:border-neutral-700">
          퀴즈가 없습니다. 위 "+ 퀴즈 추가" 로 AI 생성 가능.
        </p>
      ) : (
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
      )}
    </div>
  );
}

function AddQuizButton({ itemId }: { itemId: number }) {
  const revalidator = useRevalidator();
  const ai = useAiAvailability();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const data = await addGrammarQuiz(itemId, "default");
      if (data.usage) showUsageToast("✦ 퀴즈 생성", data.usage);
      revalidator.revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="truncate text-xs text-rose-600" title={error}>
          {error}
        </span>
      )}
      <button
        type="button"
        disabled={busy || !ai.hasAi}
        onClick={generate}
        title={ai.hasAi ? "AI 로 퀴즈 1개 추가" : "AI 키 미설정"}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-700 hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
      >
        {busy ? <Spinner className="h-3 w-3" /> : "✦"} 퀴즈 추가
      </button>
    </div>
  );
}
