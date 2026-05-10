import { useMemo } from "react";
import type {
  BlankPayload,
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

/** particle_blank + pattern_blank 공통. type 만 라벨이 다름. */
export function BlankQuiz({
  step,
  payload,
  variant,
  itemId,
  quizIndex,
  initialExplanation,
  controlled,
}: {
  step: string;
  payload: BlankPayload;
  variant: "particle" | "pattern";
  itemId: number;
  quizIndex: number;
  initialExplanation: GrammarQuizExplanation | null;
  controlled?: ControlledPick;
}) {
  const [picked, setPicked] = usePickState(controlled);
  const expl = useQuizExplanation(itemId, quizIndex, initialExplanation);

  const tokens = useMemo(
    () => parseSentence(payload.sentence, "blank-quiz"),
    [payload.sentence],
  );
  // Pick 후에만 TTS 가능. 답이 들어간 완성 문장이라 spoiler 막기 위해.
  const ttsText = picked !== null ? tokensToPlain(tokens) : "";
  const choices = useMemo(() => {
    const all = [payload.answer, ...payload.distractors].map((raw) => ({
      raw,
      tokens: parseSentence(raw, "blank-quiz choice"),
    }));
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
      label={variant === "particle" ? "조사 빈칸" : "문형 빈칸"}
      picked={picked !== null}
      isCorrect={isCorrect}
      prompt={
        <p className="text-xl leading-loose text-neutral-900 [font-family:'Noto_Sans_JP',sans-serif] sm:text-2xl dark:text-neutral-100">
          <GrammarSentence
            tokens={tokens}
            blankPlaceholder={picked === null}
            revealAnswer={picked !== null}
          />
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
              <GrammarSentence tokens={c.tokens} highlightClass="" />
            </ChoiceButton>
          ))}
        </ChoiceGrid>
      }
      footer={
        picked !== null ? (
          <span>{payload.translationKo}</span>
        ) : null
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
