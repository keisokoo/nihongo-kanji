import { useMemo } from "react";
import type {
  ConjugationPayload,
  GrammarQuizExplanation,
} from "~/lib/idb/grammar-types";
import { ChoiceButton, ChoiceGrid, QuizShell } from "../QuizShell";
import {
  QuizExplanationButton,
  QuizExplanationPanel,
  useQuizExplanation,
} from "./QuizExplanation";
import { QuizTtsButton } from "./QuizTtsButton";
import { usePickState, type ControlledPick } from "./usePickState";

const GROUP_LABELS: Record<ConjugationPayload["group"], string> = {
  godan: "1그룹 (五段)",
  ichidan: "2그룹 (一段)",
  irregular: "불규칙",
  i_adj: "い형용사",
  na_adj: "な형용사",
  noun: "명사",
  any: "공통",
};

export function ConjugationQuiz({
  step,
  payload,
  itemId,
  quizIndex,
  initialExplanation,
  controlled,
}: {
  step: string;
  payload: ConjugationPayload;
  itemId: number;
  quizIndex: number;
  initialExplanation: GrammarQuizExplanation | null;
  controlled?: ControlledPick;
}) {
  const [picked, setPicked] = usePickState(controlled);
  const expl = useQuizExplanation(itemId, quizIndex, initialExplanation);
  const choices = useMemo(() => {
    const all = [payload.answer, ...payload.distractors];
    // Deterministic-enough shuffle on mount
    const a = [...all];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCorrect = picked === null ? null : picked === payload.answer;

  return (
    <QuizShell
      step={step}
      label="활용"
      picked={picked !== null}
      isCorrect={isCorrect}
      prompt={
        <div className="space-y-1.5">
          <div className="text-xs text-neutral-500">
            <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
              {GROUP_LABELS[payload.group]}
            </span>
            <span className="ml-2">→ {payload.targetFormLabel}</span>
          </div>
          <div className="text-2xl font-semibold text-neutral-900 [font-family:'Noto_Sans_JP',sans-serif] sm:text-3xl dark:text-neutral-100">
            {payload.dictForm}
          </div>
        </div>
      }
      choices={
        <ChoiceGrid>
          {choices.map((c) => (
            <ChoiceButton
              key={c}
              myKey={c}
              pickedKey={picked}
              picked={picked !== null}
              isCorrect={c === payload.answer}
              japanese
              onPick={() => setPicked(c)}
            >
              {c}
            </ChoiceButton>
          ))}
        </ChoiceGrid>
      }
      footer={
        picked !== null && payload.hintKo ? <span>💡 {payload.hintKo}</span> : null
      }
      ttsButton={<QuizTtsButton text={payload.dictForm} />}
      explanationButton={
        <QuizExplanationButton
          state={expl.state}
          toggle={expl.toggle}
          disabled={picked === null}
        />
      }
      explanationPanel={
        <QuizExplanationPanel
          state={expl.state}
          fetchExplanation={expl.fetchExplanation}
          setShowRegenModal={expl.setShowRegenModal}
        />
      }
    />
  );
}
