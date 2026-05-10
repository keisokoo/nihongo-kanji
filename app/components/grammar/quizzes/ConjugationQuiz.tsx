import { useMemo } from "react";
import type {
  ConjugationPayload,
  GrammarQuizExplanation,
} from "~/lib/idb/grammar-types";
import { parseSentence, tokensToPlain } from "~/lib/sentence";
import { ChoiceButton, ChoiceGrid, QuizShell } from "../QuizShell";
import { GrammarSentence } from "../GrammarSentence";
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

  // dictForm 은 ruby markup `{漢字|かな}` 가 포함될 수 있어 토큰화해서 렌더.
  const dictTokens = useMemo(
    () => parseSentence(payload.dictForm, "conjugation dictForm"),
    [payload.dictForm],
  );
  const dictPlain = useMemo(() => tokensToPlain(dictTokens), [dictTokens]);

  const choices = useMemo(() => {
    const all = [payload.answer, ...payload.distractors].map((raw) => ({
      raw,
      tokens: parseSentence(raw, "conjugation choice"),
    }));
    // Deterministic-enough shuffle on mount
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
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
            <GrammarSentence tokens={dictTokens} highlightClass="" />
          </div>
        </div>
      }
      choices={
        <ChoiceGrid>
          {choices.map((c) => (
            <ChoiceButton
              key={c.raw}
              myKey={c.raw}
              pickedKey={picked}
              picked={picked !== null}
              isCorrect={c.raw === payload.answer}
              japanese
              onPick={() => setPicked(c.raw)}
            >
              <GrammarSentence tokens={c.tokens} highlightClass="" />
            </ChoiceButton>
          ))}
        </ChoiceGrid>
      }
      footer={
        picked !== null && payload.hintKo ? <span>💡 {payload.hintKo}</span> : null
      }
      ttsButton={<QuizTtsButton text={dictPlain} />}
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
