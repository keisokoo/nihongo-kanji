import { useState } from "react";
import type { GrammarQuizExplanation } from "~/lib/idb/grammar-types";
import { addGrammarQuizExplanation } from "~/lib/idb/grammar-actions";
import { useAiAvailability } from "~/lib/idb/use-ai-availability";
import { ConfirmModal } from "~/components/ConfirmModal";
import { showUsageToast } from "~/components/Toast";
import { Spinner } from "~/components/Spinner";
import {
  ExplanationCard,
  ExplSection,
  type ExplStatus,
} from "../ExplanationCard";

type State = {
  explanation: GrammarQuizExplanation | null;
  open: boolean;
  status: ExplStatus;
  showRegenModal: boolean;
};

export function useQuizExplanation(
  itemId: number,
  quizIndex: number,
  initial: GrammarQuizExplanation | null,
) {
  const [s, setS] = useState<State>({
    explanation: initial,
    open: false,
    status: { kind: "idle" },
    showRegenModal: false,
  });

  async function fetchExplanation(tier: "default" | "premium") {
    setS((prev) => ({ ...prev, open: true, status: { kind: "loading", tier } }));
    try {
      const data = await addGrammarQuizExplanation(itemId, quizIndex, tier);
      if (data.usage) showUsageToast("📖 퀴즈 해설", data.usage);
      setS((prev) => ({
        ...prev,
        explanation: data.explanation,
        status: { kind: "idle" },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setS((prev) => ({ ...prev, status: { kind: "error", message } }));
    }
  }

  function toggle() {
    if (!s.explanation) {
      fetchExplanation("default");
    } else {
      setS((prev) => ({ ...prev, open: !prev.open }));
    }
  }

  function setShowRegenModal(v: boolean) {
    setS((prev) => ({ ...prev, showRegenModal: v }));
  }

  return {
    state: s,
    toggle,
    fetchExplanation,
    setShowRegenModal,
  };
}

export function QuizExplanationButton({
  state,
  toggle,
  disabled,
}: {
  state: State;
  toggle: () => void;
  disabled?: boolean;
}) {
  const ai = useAiAvailability();
  const noKey = !state.explanation && !ai.hasAi;
  return (
    <button
      type="button"
      disabled={
        state.status.kind === "loading" || disabled || noKey
      }
      onClick={toggle}
      aria-pressed={state.open}
      aria-label="퀴즈 해설"
      title={
        noKey
          ? "AI 키 미설정"
          : disabled
            ? "정답을 먼저 선택하세요"
            : "정답 해설 (왜 이게 정답인지)"
      }
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm transition disabled:opacity-40 ${
        state.open
          ? "border-sky-400 bg-sky-50 text-sky-900 dark:border-sky-500 dark:bg-sky-950 dark:text-sky-200"
          : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      }`}
    >
      {state.status.kind === "loading" ? (
        <Spinner className="h-3.5 w-3.5" />
      ) : (
        <span aria-hidden>📖</span>
      )}
    </button>
  );
}

export function QuizExplanationPanel({
  state,
  fetchExplanation,
  setShowRegenModal,
}: {
  state: State;
  fetchExplanation: (tier: "default" | "premium") => void;
  setShowRegenModal: (v: boolean) => void;
}) {
  const expl = state.explanation;
  return (
    <>
      {state.open && (
        <ExplanationCard
          title="퀴즈 해설"
          status={state.status}
          hasExplanation={!!expl}
          onRegenerate={() => setShowRegenModal(true)}
          onRetry={() => fetchExplanation("default")}
          modelUsed={expl?.modelUsed}
          createdAt={expl?.createdAt}
        >
          {expl && (
            <>
              <ExplSection label="문제 분석" body={expl.promptAnalysis} />
              <ExplSection label="정답" body={expl.correctAnswer} />
              <ExplSection label="왜 이게 정답인가" body={expl.whyCorrect} />
              <ExplSection
                label="다른 선택지가 왜 틀리는가"
                body={expl.whyOthersWrong}
              />
            </>
          )}
        </ExplanationCard>
      )}
      <ConfirmModal
        open={state.showRegenModal}
        title="퀴즈 해설 다시 생성"
        body={
          <>
            <p>
              <strong>Sonnet</strong> 으로 퀴즈 해설을 다시 생성합니다.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              기존 해설을 덮어씁니다. 비용이 더 발생합니다.
            </p>
          </>
        }
        confirmLabel="생성"
        onConfirm={() => {
          setShowRegenModal(false);
          fetchExplanation("premium");
        }}
        onCancel={() => setShowRegenModal(false)}
      />
    </>
  );
}
