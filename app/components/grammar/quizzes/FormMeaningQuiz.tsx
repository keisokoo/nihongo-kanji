import { useMemo } from "react";
import type {
  FormMeaningPayload,
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

export function FormMeaningQuiz({
  step,
  payload,
  itemId,
  quizIndex,
  initialExplanation,
  controlled,
}: {
  step: string;
  payload: FormMeaningPayload;
  itemId: number;
  quizIndex: number;
  initialExplanation: GrammarQuizExplanation | null;
  controlled?: ControlledPick;
}) {
  const [picked, setPicked] = usePickState(controlled);
  const expl = useQuizExplanation(itemId, quizIndex, initialExplanation);

  const promptTokens = useMemo(
    () => parseSentence(payload.prompt, "form-meaning prompt"),
    [payload.prompt],
  );
  const ctxTokens = useMemo(
    () =>
      payload.contextSentence
        ? parseSentence(payload.contextSentence, "form-meaning context")
        : null,
    [payload.contextSentence],
  );
  // TTS 는 prompt 우선, context 가 있으면 context 까지 합쳐 더 자연스럽게.
  const ttsText = useMemo(() => {
    const p = tokensToPlain(promptTokens);
    if (ctxTokens) return tokensToPlain(ctxTokens);
    return p;
  }, [promptTokens, ctxTokens]);

  const choices = useMemo(() => {
    const all = [payload.answer, ...payload.distractors];
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
      label="의미"
      picked={picked !== null}
      isCorrect={isCorrect}
      prompt={
        <div className="space-y-2">
          <p className="text-2xl font-semibold text-neutral-900 [font-family:'Noto_Sans_JP',sans-serif] sm:text-3xl dark:text-neutral-100">
            <GrammarSentence tokens={promptTokens} highlightClass="" />
          </p>
          {ctxTokens && (
            <p className="text-sm leading-loose text-neutral-500 [font-family:'Noto_Sans_JP',sans-serif] dark:text-neutral-400">
              <GrammarSentence tokens={ctxTokens} highlightClass="font-medium text-neutral-700 dark:text-neutral-300" />
            </p>
          )}
          <p className="text-xs text-neutral-500">→ 무슨 의미인가?</p>
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
              onPick={() => setPicked(c)}
            >
              {c}
            </ChoiceButton>
          ))}
        </ChoiceGrid>
      }
      ttsButton={<QuizTtsButton text={ttsText} />}
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
