import { useState } from "react";
import { useTtsPlayer } from "~/lib/useTtsPlayer";

export type QuizQuestion = {
  exampleId: number;
  word: string;
  sentence: string | null;
  sentenceTranslationKo: string | null;
  readingType: "on" | "kun";
  correct: string;
  choices: string[];
};

type Props = { questions: QuizQuestion[] };

export function ExampleQuiz({ questions }: Props) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const q = questions[index];
  const isLast = index === questions.length - 1;
  const isCorrect = picked !== null && picked === q.correct;

  function pick(choice: string) {
    if (picked) return;
    setPicked(choice);
    if (choice === q.correct) setScore((s) => s + 1);
  }

  function next() {
    setPicked(null);
    setIndex((i) => Math.min(i + 1, questions.length - 1));
  }

  function reset() {
    setPicked(null);
    setIndex(0);
    setScore(0);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-xs text-neutral-500">
        <span>
          {index + 1} / {questions.length}
        </span>
        <span>점수 {score}</span>
      </div>

      <ExampleBlock q={q} />

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {q.choices.map((choice) => {
          const state =
            picked === null
              ? "idle"
              : choice === q.correct
                ? "correct"
                : choice === picked
                  ? "wrong"
                  : "muted";
          return (
            <button
              key={choice}
              type="button"
              disabled={picked !== null}
              onClick={() => pick(choice)}
              className={cn(
                "rounded-lg border px-4 py-3 text-left text-base transition [font-family:'Noto_Sans_JP',sans-serif]",
                state === "idle" &&
                  "border-neutral-200 bg-white hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900",
                state === "correct" &&
                  "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
                state === "wrong" &&
                  "border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100",
                state === "muted" &&
                  "border-neutral-200 bg-white opacity-50 dark:border-neutral-800 dark:bg-neutral-900",
              )}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="mt-6 flex items-center justify-between">
          <span
            className={cn(
              "text-sm font-medium",
              isCorrect ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {isCorrect ? "정답!" : `정답: ${q.correct}`}
          </span>
          {isLast ? (
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
            >
              다시 풀기
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
            >
              다음
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ExampleBlock({ q }: { q: QuizQuestion }) {
  const { play, loading } = useTtsPlayer();
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
        {q.readingType === "on" ? "음독" : "훈독"} 예문
      </div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 [font-family:'Noto_Sans_JP',sans-serif]">
          {q.word}
        </span>
        <button
          type="button"
          disabled={loading}
          onClick={() => play(q.word)}
          className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          aria-label="발음 듣기"
        >
          ♪
        </button>
      </div>
      {q.sentence && (
        <p className="mt-3 text-base text-neutral-800 dark:text-neutral-200 [font-family:'Noto_Sans_JP',sans-serif]">
          {q.sentence}
        </p>
      )}
      {q.sentenceTranslationKo && (
        <p className="mt-1 text-sm text-neutral-500">
          {q.sentenceTranslationKo}
        </p>
      )}
    </div>
  );
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
