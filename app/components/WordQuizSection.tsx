import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTtsPlayer } from "~/lib/useTtsPlayer";
import type {
  Example,
  ExampleExplanation,
  SentenceToken,
  Word,
  WordExplanation,
} from "~/lib/db";
import { tokensToPlain } from "~/lib/sentence";
import { Spinner } from "./Spinner";
import { ConfirmModal } from "./ConfirmModal";
import { SentenceRender } from "./SentenceRender";
import { showUsageToast, type ApiUsage } from "./Toast";

type ApiExample = {
  example: {
    id: number;
    sentence: SentenceToken[];
    sentenceTranslationKo: string | null;
    source: "seed" | "generated";
  };
  cached: boolean;
  modelUsed?: string;
  usage?: ApiUsage | null;
};

type WordResponse = {
  word: Word;
  kanjiReading: string;
  matched: boolean;
  modelUsed: string;
  usage?: ApiUsage | null;
};

type GenStatus =
  | { kind: "idle" }
  | { kind: "loading"; tier: "default" | "premium" }
  | { kind: "error"; message: string };

type Props = {
  packKey: string;
  kanjiId: number;
  words: Word[];
  activeWord: Word;
  initialExamples: Example[];
  distractorPool: string[];
};

export function WordQuizSection({
  packKey,
  kanjiId,
  words,
  activeWord,
  initialExamples,
  distractorPool,
}: Props) {
  const navigate = useNavigate();
  const [addingWord, setAddingWord] = useState<
    | null
    | { state: "loading" }
    | { state: "error"; message: string }
  >(null);
  const [showAddModal, setShowAddModal] = useState(false);

  async function addWord() {
    setShowAddModal(false);
    setAddingWord({ state: "loading" });
    try {
      const res = await fetch("/api/word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanjiId, tier: "premium" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      const data = (await res.json()) as WordResponse;
      if (data.usage) showUsageToast("✦ 단어 + 예문 추가", data.usage);
      // Soft-navigate to the new word — loader re-runs and picks it up.
      navigate(
        `/study/${encodeURIComponent(packKey)}/${kanjiId}?word=${encodeURIComponent(data.word.word)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setAddingWord({ state: "error", message });
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm uppercase tracking-wide text-neutral-500">
          단어
        </h2>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {addingWord?.state === "error" && (
            <span className="text-xs text-rose-600">{addingWord.message}</span>
          )}
          <button
            type="button"
            disabled={addingWord?.state === "loading"}
            onClick={() => setShowAddModal(true)}
            className="group inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-700 opacity-50 transition hover:border-neutral-400 hover:opacity-100 disabled:opacity-50 sm:px-3 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            title="이 한자를 쓰는 새 단어 + 예문 1개를 Sonnet으로 생성"
          >
            {addingWord?.state === "loading" ? (
              <>
                <Spinner className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">단어 + 예문 생성 중…</span>
                <span className="sm:hidden">생성 중…</span>
              </>
            ) : (
              <>✦ 단어 추가</>
            )}
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5 sm:gap-2">
        {words.map((w) => {
          const isActive = w.id === activeWord.id;
          const isGenerated = w.source === "generated";
          return (
            <Link
              key={w.id}
              to={`/study/${encodeURIComponent(packKey)}/${kanjiId}?word=${encodeURIComponent(w.word)}`}
              prefetch="intent"
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition sm:px-4 sm:py-2 sm:text-base [font-family:'Noto_Sans_JP',sans-serif]",
                isActive
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
              )}
              title={isGenerated ? "Claude 생성" : undefined}
            >
              {w.word}
              {isGenerated && (
                <span
                  className={cn(
                    "ml-1.5 text-[0.65rem]",
                    isActive ? "opacity-70" : "text-neutral-400",
                  )}
                >
                  ✦
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <ActiveWordQuiz
        word={activeWord}
        initialExamples={initialExamples}
        distractorPool={distractorPool}
      />

      <ConfirmModal
        open={showAddModal}
        title="새 단어 생성"
        body={
          <>
            <p>
              <span className="font-semibold [font-family:'Noto_Sans_JP',sans-serif]">
                {/* show the kanji from word context — derived from any word */}
                {activeWord.word.match(/\p{sc=Han}/u)?.[0] ?? ""}
              </span>{" "}
              를 쓰는 새 단어와 예문 1개를 <strong>Sonnet</strong> 으로
              생성합니다.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              비용이 발생합니다 (단어 + 예문, 캐시 우회).
            </p>
          </>
        }
        confirmLabel="생성"
        onConfirm={addWord}
        onCancel={() => setShowAddModal(false)}
      />
    </div>
  );
}

function ActiveWordQuiz({
  word,
  initialExamples,
  distractorPool,
}: {
  word: Word;
  initialExamples: Example[];
  distractorPool: string[];
}) {
  const [examples, setExamples] = useState<Example[]>(initialExamples);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [picks, setPicks] = useState<Map<number, string>>(new Map());
  const [genStatus, setGenStatus] = useState<GenStatus>({ kind: "idle" });
  const [showRegenModal, setShowRegenModal] = useState(false);

  const [explanation, setExplanation] = useState<WordExplanation | null>(
    word.explanation ?? null,
  );
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [explanationStatus, setExplanationStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading"; tier: "default" | "premium" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [showExplRegenModal, setShowExplRegenModal] = useState(false);

  const [exampleExplOpen, setExampleExplOpen] = useState(false);
  const [exampleExplStatus, setExampleExplStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading"; tier: "default" | "premium" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [showExampleExplRegenModal, setShowExampleExplRegenModal] =
    useState(false);

  const choicesCache = useRef(new Map<number, string[]>());

  const { play, loading: ttsLoading, loadingText } = useTtsPlayer();
  const wordTtsLoading = loadingText === word.word;

  const current = examples[currentIndex];
  const currentChoices = useMemo(() => {
    if (!current) return [];
    let cached = choicesCache.current.get(current.id);
    if (!cached) {
      const distractors = sample(
        distractorPool.filter((r) => r !== word.wordReading),
        3,
      );
      cached = shuffle([word.wordReading, ...distractors]);
      choicesCache.current.set(current.id, cached);
    }
    return cached;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, word.wordReading]);

  const score = useMemo(() => {
    let correct = 0;
    for (const [, picked] of picks) {
      if (picked === word.wordReading) correct++;
    }
    return { correct, total: picks.size };
  }, [picks, word.wordReading]);

  function pick(choice: string) {
    if (!current) return;
    if (picks.has(current.id)) return;
    setPicks((prev) => new Map(prev).set(current.id, choice));
  }

  async function generate(tier: "default" | "premium") {
    setGenStatus({ kind: "loading", tier });
    try {
      const res = await fetch("/api/example", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordId: word.id,
          excludeIds: examples.map((e) => e.id),
          tier,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      const data = (await res.json()) as ApiExample;
      if (data.usage) showUsageToast("✦ 예문 생성", data.usage);
      const newRow: Example = {
        id: data.example.id,
        wordId: word.id,
        sentence: data.example.sentence,
        sentenceTranslationKo: data.example.sentenceTranslationKo,
        source: data.example.source,
        createdAt: new Date(),
        explanation: null,
      };
      setExamples((prev) => {
        // dedupe in case API returned an existing one
        if (prev.some((e) => e.id === newRow.id)) return prev;
        return [...prev, newRow];
      });
      setCurrentIndex(examples.length);
      setGenStatus({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setGenStatus({ kind: "error", message });
    }
  }

  function handleRegenConfirm() {
    setShowRegenModal(false);
    generate("premium");
  }

  async function fetchExplanation(tier: "default" | "premium") {
    setExplanationOpen(true);
    setExplanationStatus({ kind: "loading", tier });
    try {
      const res = await fetch("/api/explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId: word.id, tier }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      const data = (await res.json()) as {
        explanation: WordExplanation;
        cached: boolean;
        usage?: ApiUsage | null;
      };
      if (data.usage) showUsageToast("💡 해설 생성", data.usage);
      setExplanation(data.explanation);
      setExplanationStatus({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setExplanationStatus({ kind: "error", message });
    }
  }

  function handleExplanationToggle() {
    if (!explanation) {
      // First time — fetch with default tier (Haiku) automatically.
      fetchExplanation("default");
    } else {
      setExplanationOpen((v) => !v);
    }
  }

  function handleExplRegenConfirm() {
    setShowExplRegenModal(false);
    fetchExplanation("premium");
  }

  async function fetchExampleExplanation(tier: "default" | "premium") {
    if (!current) return;
    const exampleId = current.id;
    setExampleExplOpen(true);
    setExampleExplStatus({ kind: "loading", tier });
    try {
      const res = await fetch("/api/example-explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exampleId, tier }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      const data = (await res.json()) as {
        explanation: ExampleExplanation;
        cached: boolean;
        usage?: ApiUsage | null;
      };
      if (data.usage) showUsageToast("📖 예문 해설", data.usage);
      setExamples((prev) =>
        prev.map((e) =>
          e.id === exampleId ? { ...e, explanation: data.explanation } : e,
        ),
      );
      setExampleExplStatus({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setExampleExplStatus({ kind: "error", message });
    }
  }

  function handleExampleExplToggle() {
    if (!current) return;
    if (!current.explanation) {
      fetchExampleExplanation("default");
    } else {
      setExampleExplOpen((v) => !v);
    }
  }

  function handleExampleExplRegenConfirm() {
    setShowExampleExplRegenModal(false);
    fetchExampleExplanation("premium");
  }

  // Reset example-explanation panel state when navigating between examples.
  useEffect(() => {
    setExampleExplOpen(false);
    setExampleExplStatus({ kind: "idle" });
  }, [currentIndex]);

  const picked = current ? (picks.get(current.id) ?? null) : null;
  const reveal = picked !== null;
  const isCorrect = picked !== null && picked === word.wordReading;
  const revealReading = isCorrect; // reveal hidden hiragana only on correct

  // No examples yet — show generate-first call to action.
  if (examples.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
        <WordHeader
          word={word}
          score={null}
          revealReading={false}
          onPlay={play}
          ttsLoading={ttsLoading}
          wordTtsLoading={wordTtsLoading}
          onRegenerate={null}
          regenDisabled={true}
          explanationOpen={explanationOpen}
          explanationLoading={explanationStatus.kind === "loading"}
          onToggleExplanation={handleExplanationToggle}
        />
        {explanationOpen && (
          <ExplanationPanel
            explanation={explanation}
            status={explanationStatus}
            onRegenerate={() => setShowExplRegenModal(true)}
            onRetry={() => fetchExplanation("default")}
          />
        )}
        <div className="mt-6">
          {genStatus.kind === "error" ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-rose-600">
                예문 생성 실패: {genStatus.message}
              </p>
              <button
                type="button"
                onClick={() => generate("default")}
                className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-base hover:border-neutral-400"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-neutral-500">
                이 단어로 만든 예문이 아직 없습니다. 생성하면 4지선다 퀴즈로
                풀 수 있어요.
              </p>
              <button
                type="button"
                disabled={genStatus.kind === "loading"}
                onClick={() => generate("default")}
                className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-5 py-2.5 text-base text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {genStatus.kind === "loading" ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    생성 중…
                  </>
                ) : (
                  "문제 생성"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
  const sentencePlain = current ? tokensToPlain(current.sentence) : "";
  const sentenceLoading = !!sentencePlain && loadingText === sentencePlain;
  const isGenerating = genStatus.kind === "loading";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
      <WordHeader
        word={word}
        score={score}
        revealReading={revealReading}
        onPlay={play}
        ttsLoading={ttsLoading}
        wordTtsLoading={wordTtsLoading}
        onRegenerate={() => setShowRegenModal(true)}
        regenDisabled={isGenerating}
        explanationOpen={explanationOpen}
        explanationLoading={explanationStatus.kind === "loading"}
        onToggleExplanation={handleExplanationToggle}
      />

      {explanationOpen && (
        <ExplanationPanel
          explanation={explanation}
          status={explanationStatus}
          onRegenerate={() => setShowExplRegenModal(true)}
          onRetry={() => fetchExplanation("default")}
        />
      )}

      <div className="relative mt-6">
        {isGenerating && genStatus.tier === "premium" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-sm dark:bg-neutral-950/70">
            <div className="flex items-center gap-2 text-base text-neutral-600 dark:text-neutral-300">
              <Spinner className="h-5 w-5" />
              고품질 예문 생성 중…
            </div>
          </div>
        )}

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:p-6 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-start gap-3">
            <p className="flex-1 text-lg leading-loose text-neutral-800 sm:text-2xl dark:text-neutral-200 [font-family:'Noto_Sans_JP',sans-serif]">
              <SentenceRender
                tokens={current!.sentence}
                revealTarget={reveal}
                wordReading={word.wordReading}
              />
            </p>
            <div className="mt-1 flex shrink-0 items-center gap-2 sm:mt-2">
              <button
                type="button"
                disabled={ttsLoading}
                onClick={() => play(sentencePlain)}
                aria-label="예문 발음"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-base text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {sentenceLoading ? <Spinner className="h-4 w-4" /> : "♪"}
              </button>
              <button
                type="button"
                disabled={exampleExplStatus.kind === "loading"}
                onClick={handleExampleExplToggle}
                aria-label="예문 해설"
                aria-pressed={exampleExplOpen}
                title="예문 전체에 대한 해설 (늬앙스/문법/표현)"
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full border text-base transition disabled:opacity-50",
                  exampleExplOpen
                    ? "border-sky-400 bg-sky-50 text-sky-900 dark:border-sky-500 dark:bg-sky-950 dark:text-sky-200"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800",
                )}
              >
                {exampleExplStatus.kind === "loading" ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <span aria-hidden>📖</span>
                )}
              </button>
            </div>
          </div>
          {current!.sentenceTranslationKo && (
            <p className="mt-3 text-sm text-neutral-500 sm:text-base">
              {current!.sentenceTranslationKo}
            </p>
          )}
        </div>

        {exampleExplOpen && (
          <ExampleExplanationPanel
            explanation={current!.explanation ?? null}
            status={exampleExplStatus}
            onRegenerate={() => setShowExampleExplRegenModal(true)}
            onRetry={() => fetchExampleExplanation("default")}
          />
        )}

        <div className="mt-5 grid gap-2.5 sm:mt-6 sm:gap-3 sm:grid-cols-2">
          {currentChoices.map((choice) => {
            const stateClass =
              picked === null
                ? "border-neutral-200 bg-white hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
                : choice === word.wordReading
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                  : choice === picked
                    ? "border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100"
                    : "border-neutral-200 bg-white opacity-50 dark:border-neutral-800 dark:bg-neutral-900";
            return (
              <button
                key={choice}
                type="button"
                disabled={picked !== null || isGenerating}
                onClick={() => pick(choice)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left text-lg transition sm:px-5 sm:py-4 sm:text-xl [font-family:'Noto_Sans_JP',sans-serif]",
                  stateClass,
                )}
              >
                {choice}
              </button>
            );
          })}
        </div>

        {picked !== null && (
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={cn(
                "text-base font-medium",
                isCorrect ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {isCorrect ? "정답!" : `정답: ${word.wordReading}`}
            </span>
            {isCorrect && word.meaningsKo && word.meaningsKo.length > 0 && (
              <span className="text-sm text-neutral-600 dark:text-neutral-300">
                뜻 — {word.meaningsKo.join(" · ")}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 sm:mt-6">
        <div className="flex items-center gap-2">
          <NavBtn
            disabled={currentIndex === 0 || isGenerating}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            label="◀"
            longLabel="◀ 이전 문제"
          />
          <span className="text-sm tabular-nums text-neutral-500">
            {currentIndex + 1} / {examples.length}
          </span>
          <NavBtn
            disabled={
              currentIndex >= examples.length - 1 || isGenerating
            }
            onClick={() =>
              setCurrentIndex((i) => Math.min(examples.length - 1, i + 1))
            }
            label="▶"
            longLabel="다음 문제 ▶"
          />
        </div>
        <button
          type="button"
          disabled={isGenerating}
          onClick={() => generate("default")}
          className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isGenerating && genStatus.tier === "default" ? (
            <>
              <Spinner className="h-3.5 w-3.5" />
              생성 중…
            </>
          ) : (
            "문제 생성"
          )}
        </button>
      </div>

      {genStatus.kind === "error" && (
        <p className="mt-4 text-sm text-rose-600">
          예문 생성 실패: {genStatus.message}
        </p>
      )}

      {(current?.source === "generated" ||
        genStatus.kind === "loading") &&
        current && (
          <p className="mt-3 text-xs text-neutral-400">
            {current.source === "generated" ? "생성됨" : "캐시"}
          </p>
        )}

      <ConfirmModal
        open={showRegenModal}
        title="고품질 모델로 다시 생성"
        body={
          <>
            <p>
              <strong>Sonnet</strong> 으로 새 예문을 생성합니다 (캐시 우회).
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              비용이 더 발생합니다.
            </p>
          </>
        }
        confirmLabel="생성"
        onConfirm={handleRegenConfirm}
        onCancel={() => setShowRegenModal(false)}
      />

      <ConfirmModal
        open={showExplRegenModal}
        title="해설 다시 생성"
        body={
          <>
            <p>
              <strong>Sonnet</strong> 으로 해설을 다시 생성합니다.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              기존 해설을 덮어씁니다. 비용이 더 발생합니다.
            </p>
          </>
        }
        confirmLabel="생성"
        onConfirm={handleExplRegenConfirm}
        onCancel={() => setShowExplRegenModal(false)}
      />

      <ConfirmModal
        open={showExampleExplRegenModal}
        title="예문 해설 다시 생성"
        body={
          <>
            <p>
              <strong>Sonnet</strong> 으로 예문 해설을 다시 생성합니다.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              기존 예문 해설을 덮어씁니다. 비용이 더 발생합니다.
            </p>
          </>
        }
        confirmLabel="생성"
        onConfirm={handleExampleExplRegenConfirm}
        onCancel={() => setShowExampleExplRegenModal(false)}
      />
    </div>
  );
}

function ExampleExplanationPanel({
  explanation,
  status,
  onRegenerate,
  onRetry,
}: {
  explanation: ExampleExplanation | null;
  status:
    | { kind: "idle" }
    | { kind: "loading"; tier: "default" | "premium" }
    | { kind: "error"; message: string };
  onRegenerate: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-900/50 dark:bg-sky-950/30">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-200">
          예문 해설
        </h3>
        {explanation && status.kind !== "loading" && (
          <button
            type="button"
            onClick={onRegenerate}
            aria-label="예문 해설 다시 생성"
            title="Sonnet으로 다시 생성"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-sky-300 bg-white text-sm text-sky-700 opacity-40 transition hover:opacity-100 dark:border-sky-800 dark:bg-neutral-900 dark:text-sky-300"
          >
            ✦
          </button>
        )}
      </div>

      {status.kind === "loading" && (
        <div className="flex items-center gap-2 text-sm text-sky-900 dark:text-sky-200">
          <Spinner className="h-4 w-4" />
          {status.tier === "premium"
            ? "고품질 예문 해설 생성 중…"
            : "예문 해설 생성 중…"}
        </div>
      )}

      {status.kind === "error" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-rose-600">
            예문 해설 생성 실패: {status.message}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-sm hover:border-sky-400"
          >
            다시 시도
          </button>
        </div>
      )}

      {status.kind === "idle" && explanation && (
        <div className="space-y-4 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
          <ExplSection label="늬앙스" body={explanation.nuance} />
          <ExplSection label="문법" body={explanation.grammar} />
          <ExplSection label="발음" body={explanation.pronunciation} />
          <ExplSection label="학습 포인트" body={explanation.takeaways} />
          <p className="pt-1 text-xs text-neutral-400">
            {explanation.modelUsed} ·{" "}
            {new Date(explanation.createdAt).toLocaleString("ko-KR")}
          </p>
        </div>
      )}
    </div>
  );
}

function ExplSection({ label, body }: { label: string; body: string }) {
  if (!body || body.trim() === "") return null;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
        {label}
      </div>
      <p className="whitespace-pre-wrap">{body}</p>
    </div>
  );
}

function WordHeader({
  word,
  score,
  revealReading,
  onPlay,
  ttsLoading,
  wordTtsLoading,
  onRegenerate,
  regenDisabled,
  explanationOpen,
  explanationLoading,
  onToggleExplanation,
}: {
  word: Word;
  score: { correct: number; total: number } | null;
  revealReading: boolean;
  onPlay: (text: string) => void;
  ttsLoading: boolean;
  wordTtsLoading: boolean;
  onRegenerate: (() => void) | null;
  regenDisabled: boolean;
  explanationOpen: boolean;
  explanationLoading: boolean;
  onToggleExplanation: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-semibold sm:text-4xl text-neutral-900 dark:text-neutral-100 [font-family:'Noto_Sans_JP',sans-serif]">
          {word.word}
        </span>
        <span
          className={cn(
            "text-base sm:text-lg [font-family:'Noto_Sans_JP',sans-serif] selection:bg-amber-200 selection:text-neutral-900 dark:selection:bg-amber-300 dark:selection:text-neutral-900",
            revealReading
              ? "text-neutral-500 transition-colors duration-300"
              : "text-transparent",
          )}
          aria-label={
            revealReading ? word.wordReading : "단어 발음 (정답을 맞추면 표시)"
          }
        >
          {word.wordReading}
        </span>
        <button
          type="button"
          disabled={ttsLoading}
          onClick={() => onPlay(word.word)}
          aria-label="단어 발음"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {wordTtsLoading ? <Spinner className="h-4 w-4" /> : "♪"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {score && score.total > 0 && (
          <div className="text-sm text-neutral-500 tabular-nums">
            점수 {score.correct} / {score.total}
          </div>
        )}
        <button
          type="button"
          disabled={explanationLoading}
          onClick={onToggleExplanation}
          aria-label="해설 보기"
          title="이 단어 발음의 음편화/연탁/아테지 등 해설"
          aria-pressed={explanationOpen}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition disabled:opacity-50 sm:px-3",
            explanationOpen
              ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-200"
              : "border-neutral-300 bg-white text-neutral-700 hover:border-amber-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
          )}
        >
          {explanationLoading ? (
            <Spinner className="h-3.5 w-3.5" />
          ) : (
            <span aria-hidden>💡</span>
          )}
          해설
        </button>
        {onRegenerate && (
          <button
            type="button"
            disabled={regenDisabled}
            onClick={onRegenerate}
            aria-label="다시 생성 (Sonnet)"
            title="고품질 모델로 다시 생성 — 비용 발생"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 bg-white text-base text-neutral-600 opacity-30 transition hover:opacity-100 disabled:opacity-20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          >
            ✦
          </button>
        )}
      </div>
    </div>
  );
}

function ExplanationPanel({
  explanation,
  status,
  onRegenerate,
  onRetry,
}: {
  explanation: WordExplanation | null;
  status:
    | { kind: "idle" }
    | { kind: "loading"; tier: "default" | "premium" }
    | { kind: "error"; message: string };
  onRegenerate: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
          해설
        </h3>
        {explanation && status.kind !== "loading" && (
          <button
            type="button"
            onClick={onRegenerate}
            aria-label="해설 다시 생성"
            title="Sonnet으로 다시 생성"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300 bg-white text-sm text-amber-700 opacity-40 transition hover:opacity-100 dark:border-amber-800 dark:bg-neutral-900 dark:text-amber-300"
          >
            ✦
          </button>
        )}
      </div>

      {status.kind === "loading" && (
        <div className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
          <Spinner className="h-4 w-4" />
          {status.tier === "premium"
            ? "고품질 해설 생성 중…"
            : "해설 생성 중…"}
        </div>
      )}

      {status.kind === "error" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-rose-600">
            해설 생성 실패: {status.message}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm hover:border-amber-400"
          >
            다시 시도
          </button>
        </div>
      )}

      {status.kind === "idle" && explanation && (
        <div className="space-y-3 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              발음 설명
            </div>
            <p className="whitespace-pre-wrap">{explanation.reasoning}</p>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              외우기 팁
            </div>
            <p className="whitespace-pre-wrap">{explanation.mnemonic}</p>
          </div>
          <p className="pt-1 text-xs text-neutral-400">
            {explanation.modelUsed} · {new Date(explanation.createdAt).toLocaleString("ko-KR")}
          </p>
        </div>
      )}
    </div>
  );
}

function NavBtn({
  disabled,
  onClick,
  label,
  longLabel,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  longLabel?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:border-neutral-400 disabled:opacity-30 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
    >
      {longLabel ? (
        <>
          <span className="sm:hidden">{label}</span>
          <span className="hidden sm:inline">{longLabel}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
