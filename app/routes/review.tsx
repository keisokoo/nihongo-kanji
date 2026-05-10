import { useEffect, useMemo, useState } from "react";
import { Link, useRevalidator } from "react-router";
import type { Route } from "./+types/review";
import {
  buildReviewBundles,
  loadReviewData,
  markMastered,
  type GrammarReviewBundle,
  type WeakItem,
  type WordReviewBundle,
} from "~/lib/idb/review";
import { ConjugationQuiz } from "~/components/grammar/quizzes/ConjugationQuiz";
import { BlankQuiz } from "~/components/grammar/quizzes/BlankQuiz";
import { FormMeaningQuiz } from "~/components/grammar/quizzes/FormMeaningQuiz";
import { KoToJpFormQuiz } from "~/components/grammar/quizzes/KoToJpFormQuiz";
import { useTtsPlayer } from "~/lib/useTtsPlayer";
import { Spinner } from "~/components/Spinner";

export async function clientLoader() {
  const data = await loadReviewData();
  return data;
}

export function meta() {
  return [{ title: "오답노트 — Nihongo" }];
}

export default function Review({ loaderData }: Route.ComponentProps) {
  const { word, grammar, total } = loaderData;
  const revalidator = useRevalidator();

  type Mode = { kind: "browse" } | { kind: "session"; items: WeakItem[] };
  const [mode, setMode] = useState<Mode>({ kind: "browse" });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  async function startSession(items: WeakItem[]) {
    if (items.length === 0) return;
    // 무작위 셔플
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setMode({ kind: "session", items: shuffled });
  }

  async function bulkCacheTts(items: WeakItem[]) {
    setBulkBusy(true);
    setBulkMsg(null);
    let ok = 0;
    let fail = 0;
    try {
      const { synthesize } = await import("~/lib/idb/tts");
      for (const it of items) {
        const text = it.kind === "word" ? it.word : it.pattern;
        try {
          await synthesize(text);
          ok++;
          setBulkMsg(`캐싱 중… ${ok + fail} / ${items.length}`);
        } catch {
          fail++;
        }
      }
      setBulkMsg(`완료 — 성공 ${ok} / 실패 ${fail}`);
    } finally {
      setBulkBusy(false);
    }
  }

  if (mode.kind === "session") {
    return (
      <ReviewSession
        items={mode.items}
        onClose={() => {
          setMode({ kind: "browse" });
          revalidator.revalidate();
        }}
      />
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ← 메인
          </Link>
          <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl dark:text-neutral-100">
            오답노트
          </h1>
          <span className="text-sm tabular-nums text-neutral-500">
            총 {total} 항목
          </span>
        </header>

        {total === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
            <p className="text-base text-neutral-700 dark:text-neutral-300">
              아직 오답이 없어요. 시험에서 틀린 게 있으면 자동으로 여기 모입니다.
            </p>
            <Link
              to="/"
              className="mt-4 inline-block text-sm text-neutral-500 underline"
            >
              메인으로
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startSession([...word, ...grammar])}
                className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
              >
                ▶ 전체 복습 ({total})
              </button>
              {word.length > 0 && (
                <button
                  type="button"
                  onClick={() => startSession(word)}
                  className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                >
                  단어만 ({word.length})
                </button>
              )}
              {grammar.length > 0 && (
                <button
                  type="button"
                  onClick={() => startSession(grammar)}
                  className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                >
                  문법만 ({grammar.length})
                </button>
              )}
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => bulkCacheTts([...word, ...grammar])}
                className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                title="모든 약점 항목의 단어/패턴을 TTS 캐시에 채움"
              >
                {bulkBusy && <Spinner className="h-3.5 w-3.5" />}
                ♪ 음성 캐싱
              </button>
              {bulkMsg && (
                <span className="self-center text-xs text-neutral-500">
                  {bulkMsg}
                </span>
              )}
            </div>

            {word.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  단어 ({word.length})
                </h2>
                <ul className="space-y-2">
                  {word.map((w) => (
                    <li
                      key={w.sourceWordId}
                      className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-semibold text-neutral-900 [font-family:'Noto_Sans_JP',sans-serif] dark:text-neutral-100">
                            {w.word}
                          </span>
                          <span className="text-xs text-neutral-500 [font-family:'Noto_Sans_JP',sans-serif]">
                            {w.wordReading}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-neutral-500">
                          {w.meaningsKo.join(", ")} ·{" "}
                          <span className="text-neutral-400">{w.lastTestName}</span>
                        </div>
                      </div>
                      <MasterButton
                        kind="word"
                        sourceId={w.sourceWordId}
                        onChanged={() => revalidator.revalidate()}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {grammar.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  문법 ({grammar.length})
                </h2>
                <ul className="space-y-2">
                  {grammar.map((g) => (
                    <li
                      key={g.sourceItemId}
                      className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-semibold text-neutral-900 [font-family:'Noto_Sans_JP',sans-serif] dark:text-neutral-100">
                            {g.pattern}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-neutral-500">
                          {g.meaningsKo.join(", ")} ·{" "}
                          <span className="text-neutral-400">{g.lastTestName}</span>
                        </div>
                      </div>
                      <MasterButton
                        kind="grammar"
                        sourceId={g.sourceItemId}
                        onChanged={() => revalidator.revalidate()}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function MasterButton({
  kind,
  sourceId,
  onChanged,
}: {
  kind: "word" | "grammar";
  sourceId: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await markMastered(kind, sourceId);
        onChanged();
      }}
      title="기억함 — 오답노트에서 제거"
      className="shrink-0 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 hover:border-emerald-500 disabled:opacity-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
    >
      ✓ 기억함
    </button>
  );
}

// ─── Session ────────────────────────────────────────────────────────────────

function ReviewSession({
  items,
  onClose,
}: {
  items: WeakItem[];
  onClose: () => void;
}) {
  const [bundles, setBundles] = useState<{
    word: WordReviewBundle[];
    grammar: GrammarReviewBundle[];
  } | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<number, "correct" | "wrong">>(
    new Map(),
  );

  // 시퀀스에서 i 번째 가 word 인지 grammar 인지 추적하기 위해 원본 items 사용.
  const total = items.length;
  const current = items[currentIndex];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await buildReviewBundles(items);
      if (!cancelled) setBundles(b);
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  async function recordAnswer(correct: boolean) {
    if (!current) return;
    const key = currentIndex;
    if (answers.has(key)) return; // already recorded for this item
    const next = new Map(answers);
    next.set(key, correct ? "correct" : "wrong");
    setAnswers(next);
    if (correct) {
      // mastered
      const sid =
        current.kind === "word" ? current.sourceWordId : current.sourceItemId;
      await markMastered(current.kind, sid);
    }
  }

  function gotoNext() {
    if (currentIndex < total - 1) setCurrentIndex(currentIndex + 1);
  }
  function gotoPrev() {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  }

  const correctCount = useMemo(() => {
    let n = 0;
    for (const v of answers.values()) if (v === "correct") n++;
    return n;
  }, [answers]);
  const finished = answers.size === total;

  if (!bundles) {
    return (
      <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <div className="mx-auto max-w-2xl px-4 py-10 text-center">
          <Spinner className="mx-auto h-6 w-6" />
          <p className="mt-3 text-sm text-neutral-500">복습 데이터 준비 중…</p>
        </div>
      </main>
    );
  }

  if (!current) {
    return null;
  }

  // 현재 item 의 bundle 찾기
  const wordBundle =
    current.kind === "word"
      ? bundles.word.find((b) => b.word.sourceWordId === current.sourceWordId)
      : null;
  const grammarBundle =
    current.kind === "grammar"
      ? bundles.grammar.find(
          (b) => b.weak.sourceItemId === current.sourceItemId,
        )
      : null;

  const myAnswer = answers.get(currentIndex) ?? null;

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ← 오답노트로
          </button>
          <span className="text-sm tabular-nums text-neutral-500">
            {currentIndex + 1} / {total} · 맞춤 {correctCount}
          </span>
        </header>

        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className="h-full bg-neutral-900 transition-all dark:bg-neutral-100"
            style={{ width: `${(answers.size / total) * 100}%` }}
          />
        </div>

        {wordBundle ? (
          <WordReviewQuiz
            key={`word-${currentIndex}`}
            bundle={wordBundle}
            answer={myAnswer}
            onAnswer={recordAnswer}
          />
        ) : grammarBundle ? (
          <GrammarReviewQuiz
            key={`grammar-${currentIndex}`}
            bundle={grammarBundle}
            answer={myAnswer}
            onAnswer={recordAnswer}
          />
        ) : (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
            이 항목의 출처 데이터를 찾을 수 없어요. 건너뛰고 진행하세요.
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={gotoPrev}
            disabled={currentIndex === 0}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-400 disabled:opacity-30 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          >
            ◀ 이전
          </button>
          <button
            type="button"
            onClick={gotoNext}
            disabled={currentIndex >= total - 1}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-400 disabled:opacity-30 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          >
            {myAnswer ? "다음 ▶" : "건너뛰기 →"}
          </button>
        </div>

        {finished && (
          <div className="mt-8 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <h3 className="text-lg font-semibold text-emerald-900 dark:text-emerald-200">
              복습 완료!
            </h3>
            <p className="mt-2 text-base text-emerald-900 dark:text-emerald-200">
              {correctCount} / {total} 정답
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 inline-block rounded-md border border-emerald-400 bg-white px-4 py-2 text-sm text-emerald-900 hover:border-emerald-600 dark:bg-neutral-900 dark:text-emerald-200"
            >
              오답노트로 돌아가기
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

// ─── Word Review Quiz ───────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickN<T>(pool: T[], n: number): T[] {
  return shuffle(pool).slice(0, n);
}

function WordReviewQuiz({
  bundle,
  answer,
  onAnswer,
}: {
  bundle: WordReviewBundle;
  answer: "correct" | "wrong" | null;
  onAnswer: (correct: boolean) => void;
}) {
  const w = bundle.word;
  // mode 기반: ko_to_jp 면 KO 보고 JP 고르기, 그 외엔 JP 보고 KO 고르기.
  const mode: "jp_to_ko" | "ko_to_jp" =
    w.mode === "ko_to_jp" ? "ko_to_jp" : "jp_to_ko";

  const choices = useMemo(() => {
    if (mode === "ko_to_jp") {
      const correct = w.word;
      const distractors = pickN(
        bundle.jpPool.filter((x) => x !== correct),
        3,
      );
      return shuffle([correct, ...distractors]);
    }
    const correct = w.meaningsKo[0] ?? "";
    const distractors = pickN(
      bundle.meaningPool.filter(
        (m) => m && !w.meaningsKo.includes(m) && m !== correct,
      ),
      3,
    );
    return shuffle([correct, ...distractors]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.sourceWordId, mode]);

  const correctChoice = mode === "ko_to_jp" ? w.word : (w.meaningsKo[0] ?? "");
  const [picked, setPicked] = useState<string | null>(null);
  const { play, loading: ttsLoading, loadingText } = useTtsPlayer();
  const ttsLoadingForWord = loadingText === w.word;

  // 외부 answer 가 있으면 (resume), picked 도 그에 맞게 표시 — 실제 picked 텍스트는 모름.
  // 단순화: 표시 안 해도 OK (혹은 정답을 picked 처럼 표시).
  const reveal = picked !== null || answer !== null;

  function handlePick(choice: string) {
    if (picked !== null) return;
    setPicked(choice);
    onAnswer(choice === correctChoice);
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="rounded bg-amber-100 px-2 py-0.5 uppercase tracking-wide text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          단어
        </span>
        <span className="text-neutral-500">
          {mode === "ko_to_jp" ? "한국어 → 일본어" : "일본어 → 한국어"}
        </span>
      </div>

      <div className="my-4 text-center">
        {mode === "ko_to_jp" ? (
          <div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 sm:text-3xl">
            {w.meaningsKo.join(" · ")}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl font-semibold text-neutral-900 [font-family:'Noto_Sans_JP',sans-serif] sm:text-4xl dark:text-neutral-100">
              {w.word}
            </span>
            <button
              type="button"
              disabled={ttsLoading}
              onClick={() => play(w.word)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-base text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {ttsLoadingForWord ? <Spinner className="h-4 w-4" /> : "♪"}
            </button>
          </div>
        )}
        {mode !== "ko_to_jp" && (
          <p
            className={`mt-1 text-sm [font-family:'Noto_Sans_JP',sans-serif] ${
              reveal ? "text-neutral-500" : "select-none text-transparent"
            }`}
          >
            {w.wordReading}
          </p>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {choices.map((c) => {
          const isPicked = picked === c;
          const isCorrectChoice = c === correctChoice;
          let cls =
            "border-neutral-200 bg-white hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900";
          if (picked !== null) {
            if (isCorrectChoice)
              cls =
                "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
            else if (isPicked)
              cls =
                "border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100";
            else cls = "border-neutral-200 bg-white opacity-50 dark:border-neutral-800 dark:bg-neutral-900";
          }
          return (
            <button
              key={c}
              type="button"
              disabled={picked !== null}
              onClick={() => handlePick(c)}
              className={`rounded-xl border px-4 py-3 text-left text-base transition sm:px-5 sm:py-3.5 sm:text-lg ${
                mode === "ko_to_jp"
                  ? "[font-family:'Noto_Sans_JP',sans-serif]"
                  : ""
              } ${cls}`}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Grammar Review Quiz ────────────────────────────────────────────────────

function GrammarReviewQuiz({
  bundle,
  answer: _answer,
  onAnswer,
}: {
  bundle: GrammarReviewBundle;
  answer: "correct" | "wrong" | null;
  onAnswer: (correct: boolean) => void;
}) {
  const { weak, source } = bundle;

  // source 가 있으면 quizzes 중 무작위 선택, 없으면 fallback
  const quiz = useMemo(() => {
    if (!source || source.quizzes.length === 0) return null;
    return source.quizzes[Math.floor(Math.random() * source.quizzes.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id]);

  const [picked, setPicked] = useState<string | null>(null);
  const controlled = useMemo(
    () => ({
      picked,
      onPick: (choice: string) => {
        setPicked(choice);
        const correct = choice === quiz?.payload.answer;
        onAnswer(correct);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picked, quiz?.payload.answer],
  );

  if (!quiz || !source) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs uppercase tracking-wide text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            문법
          </span>
          <span className="font-semibold [font-family:'Noto_Sans_JP',sans-serif]">
            {weak.pattern}
          </span>
        </div>
        <p>
          출처 문법 항목이나 퀴즈를 찾을 수 없어요. 옆의 "기억함" 으로 처리하거나
          건너뛰세요.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onAnswer(true)}
            className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs text-emerald-700"
          >
            ✓ 기억함
          </button>
          <button
            type="button"
            onClick={() => onAnswer(false)}
            className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs text-rose-700"
          >
            ✗ 다시
          </button>
        </div>
      </div>
    );
  }

  const explanation = quiz.explanation ?? null;
  const props = {
    step: weak.pattern,
    itemId: source.id,
    quizIndex: source.quizzes.indexOf(quiz),
    initialExplanation: explanation,
    controlled,
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="rounded bg-amber-100 px-2 py-0.5 uppercase tracking-wide text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          문법
        </span>
        <span className="text-neutral-500 [font-family:'Noto_Sans_JP',sans-serif]">
          {weak.pattern}
        </span>
        <span className="text-neutral-400">{weak.meaningsKo[0] ?? ""}</span>
      </div>
      {quiz.type === "conjugation" && (
        <ConjugationQuiz {...props} payload={quiz.payload} />
      )}
      {quiz.type === "particle_blank" && (
        <BlankQuiz {...props} payload={quiz.payload} variant="particle" />
      )}
      {quiz.type === "pattern_blank" && (
        <BlankQuiz {...props} payload={quiz.payload} variant="pattern" />
      )}
      {quiz.type === "form_meaning" && (
        <FormMeaningQuiz {...props} payload={quiz.payload} />
      )}
      {quiz.type === "ko_to_jp_form" && (
        <KoToJpFormQuiz {...props} payload={quiz.payload} />
      )}
    </div>
  );
}
