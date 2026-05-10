import { useMemo } from "react";
import type {
  GrammarQuizExplanation,
  KoToJpFormPayload,
} from "~/lib/idb/grammar-types";
import { parseSentence, tokensToPlain, type SentenceToken } from "~/lib/sentence";
import { ChoiceButton, ChoiceGrid, QuizShell } from "../QuizShell";
import { GrammarSentence } from "../GrammarSentence";
import {
  QuizExplanationButton,
  QuizExplanationPanel,
  useQuizExplanation,
} from "./QuizExplanation";
import { QuizTtsButton } from "./QuizTtsButton";
import { usePickState, type ControlledPick } from "./usePickState";

type ChoiceTokens = { raw: string; tokens: SentenceToken[] };

export function KoToJpFormQuiz({
  step,
  payload,
  itemId,
  quizIndex,
  initialExplanation,
  controlled,
}: {
  step: string;
  payload: KoToJpFormPayload;
  itemId: number;
  quizIndex: number;
  initialExplanation: GrammarQuizExplanation | null;
  controlled?: ControlledPick;
}) {
  const [picked, setPicked] = usePickState(controlled);
  const expl = useQuizExplanation(itemId, quizIndex, initialExplanation);

  const choices = useMemo<ChoiceTokens[]>(() => {
    const all = [payload.answer, ...payload.distractors].map((raw) => ({
      raw,
      tokens: parseSentence(raw, "ko-to-jp choice"),
    }));
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCorrect = picked === null ? null : picked === payload.answer;

  // 정답 (일본어 마크업) 의 plain text. pick 후에만 TTS 가능 (spoiler 방지).
  const ttsText = useMemo(() => {
    if (picked === null) return "";
    return tokensToPlain(parseSentence(payload.answer, "ko-to-jp tts"));
  }, [payload.answer, picked]);

  return (
    <QuizShell
      step={step}
      label="한 → 일"
      picked={picked !== null}
      isCorrect={isCorrect}
      prompt={
        <p className="text-xl text-neutral-900 sm:text-2xl dark:text-neutral-100">
          {payload.ko}
        </p>
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
              <GrammarSentence
                tokens={c.tokens}
                highlightClass="font-semibold text-sky-700 dark:text-sky-300"
              />
            </ChoiceButton>
          ))}
        </ChoiceGrid>
      }
      footer={
        picked !== null && payload.hintKo ? <span>💡 {payload.hintKo}</span> : null
      }
      ttsButton={
        <QuizTtsButton
          text={ttsText}
          disabled={picked === null}
          reason="정답 선택 후 재생 가능"
        />
      }
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
