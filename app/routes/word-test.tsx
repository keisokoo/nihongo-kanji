import { useEffect, useMemo, useRef, useState } from "react";
import { Link, redirect, useRevalidator } from "react-router";
import { asc, eq } from "drizzle-orm";
import type { Route } from "./+types/word-test";
import {
  db,
  wordTestItems,
  wordTests,
  type Example,
  type ExampleExplanation,
  type ReadingSubPick,
  type SentenceToken,
  type WordTestItem,
  type WordTestKind,
  type WordTestMode,
} from "~/lib/db";
import {
  loadExamplesForSourceWords,
  loadFocusKanjiForSourceWords,
  type FocusKanji,
} from "~/lib/word-test.server";
import { KanjiCard } from "~/components/KanjiCard";
import { tokensToPlain } from "~/lib/sentence";
import { Spinner } from "~/components/Spinner";
import { SentenceRender } from "~/components/SentenceRender";
import {
  ExampleExplanationPanel,
  type ExampleExplStatus,
} from "~/components/ExampleExplanationPanel";
import { ConfirmModal } from "~/components/ConfirmModal";
import { showUsageToast, type ApiUsage } from "~/components/Toast";
import { useTtsPlayer } from "~/lib/useTtsPlayer";

const CHOICE_COUNT = 4;

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw redirect("/");

  const test = await db.query.wordTests.findFirst({
    where: eq(wordTests.id, id),
  });
  if (!test) throw redirect("/");

  const items = await db.query.wordTestItems.findMany({
    where: eq(wordTestItems.testId, id),
    orderBy: asc(wordTestItems.position),
  });

  // For reading kind, fetch each source word's first example AND focus kanji
  // (with readings) — same data as the word pack's KanjiCard.
  const sourceWordIds =
    test.kind === "reading"
      ? items.map((i) => i.sourceWordId).filter((x): x is number => !!x)
      : [];
  const [examplesByWordId, focusKanjiByWordId] = await Promise.all([
    test.kind === "reading"
      ? loadExamplesForSourceWords(sourceWordIds)
      : Promise.resolve(new Map<number, Example>()),
    test.kind === "reading"
      ? loadFocusKanjiForSourceWords(sourceWordIds)
      : Promise.resolve(new Map<number, FocusKanji>()),
  ]);

  const itemsWithExtras = items.map((it) => ({
    ...it,
    example: it.sourceWordId
      ? (examplesByWordId.get(it.sourceWordId) ?? null)
      : null,
    focusKanji: it.sourceWordId
      ? (focusKanjiByWordId.get(it.sourceWordId) ?? null)
      : null,
  }));

  return { test, items: itemsWithExtras };
}

export function meta({ data }: Route.MetaArgs) {
  return [
    {
      title: data?.test
        ? `${data.test.name} — 단어 시험 | Nihongo`
        : "단어 시험",
    },
  ];
}

type ItemWithExample = WordTestItem & {
  example: Example | null;
  focusKanji: FocusKanji | null;
};

type Pick_ = {
  choice: string;
  isCorrect: boolean;
  correctChoices: string[];
};

type ReadingPicks = {
  reading?: Pick_;
  meaning?: Pick_;
};

type AnswerResp = {
  isCorrect: boolean;
  correctChoices: string[];
  itemAnsweredAt: string | null;
};

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

function buildMeaningKindChoices(
  current: ItemWithExample,
  pool: ItemWithExample[],
): string[] {
  if (current.mode === "ko_to_jp") {
    const correct = current.word;
    const distractors = pickN(
      [
        ...new Set(
          pool
            .filter((p) => p.id !== current.id && p.word !== correct)
            .map((p) => p.word),
        ),
      ],
      CHOICE_COUNT - 1,
    );
    return shuffle([correct, ...distractors]);
  }
  const correct = current.meaningsKo[0] ?? "";
  const distractors = pickN(
    [
      ...new Set(
        pool
          .filter((p) => p.id !== current.id)
          .flatMap((p) => p.meaningsKo)
          .filter((m) => m && !current.meaningsKo.includes(m)),
      ),
    ],
    CHOICE_COUNT - 1,
  );
  return shuffle([correct, ...distractors]);
}

function buildReadingChoices(
  current: ItemWithExample,
  pool: ItemWithExample[],
): string[] {
  const correct = current.wordReading;
  const distractors = pickN(
    [
      ...new Set(
        pool
          .filter((p) => p.id !== current.id && p.wordReading !== correct)
          .map((p) => p.wordReading),
      ),
    ],
    CHOICE_COUNT - 1,
  );
  return shuffle([correct, ...distractors]);
}

function buildMeaningOnlyChoices(
  current: ItemWithExample,
  pool: ItemWithExample[],
): string[] {
  const correct = current.meaningsKo[0] ?? "";
  const distractors = pickN(
    [
      ...new Set(
        pool
          .filter((p) => p.id !== current.id)
          .flatMap((p) => p.meaningsKo)
          .filter((m) => m && !current.meaningsKo.includes(m)),
      ),
    ],
    CHOICE_COUNT - 1,
  );
  return shuffle([correct, ...distractors]);
}

function isItemAnswered(it: WordTestItem, kind: WordTestKind): boolean {
  if (kind === "meaning") return it.answeredAt !== null;
  return it.pickedReading !== null && it.pickedMeaning !== null;
}

export default function WordTest({ loaderData }: Route.ComponentProps) {
  const { test, items } = loaderData;
  const initialIndex = useMemo(() => {
    const firstUnanswered = items.findIndex(
      (it) => !isItemAnswered(it, test.kind),
    );
    return firstUnanswered === -1 ? 0 : firstUnanswered;
  }, [items, test.kind]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [listOpen, setListOpen] = useState(false);
  const [meaningPicks, setMeaningPicks] = useState<Map<number, Pick_>>(() => {
    const init = new Map<number, Pick_>();
    if (test.kind !== "meaning") return init;
    for (const it of items) {
      if (it.answeredAt && it.pickedChoice !== null) {
        const correctChoices =
          it.mode === "ko_to_jp" ? [it.word] : it.meaningsKo;
        init.set(it.id, {
          choice: it.pickedChoice,
          isCorrect: it.isCorrect ?? false,
          correctChoices,
        });
      }
    }
    return init;
  });
  const [readingPicks, setReadingPicks] = useState<Map<number, ReadingPicks>>(
    () => {
      const init = new Map<number, ReadingPicks>();
      if (test.kind !== "reading") return init;
      for (const it of items) {
        const entry: ReadingPicks = {};
        if (it.pickedReading !== null) {
          entry.reading = {
            choice: it.pickedReading,
            isCorrect: it.isCorrectReading ?? false,
            correctChoices: [it.wordReading],
          };
        }
        if (it.pickedMeaning !== null) {
          entry.meaning = {
            choice: it.pickedMeaning,
            isCorrect: it.isCorrectMeaning ?? false,
            correctChoices: it.meaningsKo,
          };
        }
        if (entry.reading || entry.meaning) init.set(it.id, entry);
      }
      return init;
    },
  );
  const [submitting, setSubmitting] = useState(false);

  const choicesCache = useRef(new Map<number, string[]>());
  const readingChoicesCache = useRef(new Map<number, string[]>());
  const meaningChoicesCache = useRef(new Map<number, string[]>());

  const current = items[currentIndex];
  const total = items.length;

  // Choices for meaning kind (one set per card).
  const meaningKindChoices = useMemo(() => {
    if (!current || test.kind !== "meaning") return [];
    let cached = choicesCache.current.get(current.id);
    if (!cached) {
      cached = buildMeaningKindChoices(current, items);
      choicesCache.current.set(current.id, cached);
    }
    return cached;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, test.kind]);

  // Choices for reading kind — two sets per card.
  const readingChoices = useMemo(() => {
    if (!current || test.kind !== "reading") return [];
    let cached = readingChoicesCache.current.get(current.id);
    if (!cached) {
      cached = buildReadingChoices(current, items);
      readingChoicesCache.current.set(current.id, cached);
    }
    return cached;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, test.kind]);

  const meaningChoicesForReading = useMemo(() => {
    if (!current || test.kind !== "reading") return [];
    let cached = meaningChoicesCache.current.get(current.id);
    if (!cached) {
      cached = buildMeaningOnlyChoices(current, items);
      meaningChoicesCache.current.set(current.id, cached);
    }
    return cached;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, test.kind]);

  const answeredCount = useMemo(() => {
    if (test.kind === "meaning") return meaningPicks.size;
    let n = 0;
    for (const v of readingPicks.values()) if (v.reading && v.meaning) n++;
    return n;
  }, [test.kind, meaningPicks, readingPicks]);

  const correctCount = useMemo(() => {
    if (test.kind === "meaning") {
      let n = 0;
      for (const v of meaningPicks.values()) if (v.isCorrect) n++;
      return n;
    }
    let n = 0;
    for (const v of readingPicks.values()) {
      if (v.reading?.isCorrect && v.meaning?.isCorrect) n++;
    }
    return n;
  }, [test.kind, meaningPicks, readingPicks]);

  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
  const finishedAll = answeredCount === total;

  // Per-item status for the sidebar list.
  const itemStatuses: Array<"unanswered" | "correct" | "wrong"> = useMemo(() => {
    return items.map((it) => {
      if (test.kind === "meaning") {
        const p = meaningPicks.get(it.id);
        if (!p) return "unanswered";
        return p.isCorrect ? "correct" : "wrong";
      }
      const r = readingPicks.get(it.id);
      if (!r?.reading || !r?.meaning) return "unanswered";
      return r.reading.isCorrect && r.meaning.isCorrect ? "correct" : "wrong";
    });
  }, [items, test.kind, meaningPicks, readingPicks]);

  const meaningPicked = current
    ? (meaningPicks.get(current.id) ?? null)
    : null;
  const readingPicksFor = current
    ? (readingPicks.get(current.id) ?? null)
    : null;
  const itemFullyDone =
    test.kind === "meaning"
      ? meaningPicked !== null
      : !!readingPicksFor?.reading && !!readingPicksFor?.meaning;

  async function pickMeaningKind(choice: string) {
    if (!current || meaningPicked || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/word-test/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: current.id, choice }),
      });
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      const data = (await res.json()) as AnswerResp;
      setMeaningPicks((prev) => {
        const next = new Map(prev);
        next.set(current.id, {
          choice,
          isCorrect: data.isCorrect,
          correctChoices: data.correctChoices,
        });
        return next;
      });
    } catch (err) {
      console.error("answer failed", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function pickReading(choice: string, sub: ReadingSubPick) {
    if (!current || submitting) return;
    const prev = readingPicks.get(current.id);
    if (prev?.[sub]) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/word-test/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: current.id, choice, subPick: sub }),
      });
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      const data = (await res.json()) as AnswerResp;
      setReadingPicks((curr) => {
        const next = new Map(curr);
        const existing = next.get(current.id) ?? {};
        next.set(current.id, {
          ...existing,
          [sub]: {
            choice,
            isCorrect: data.isCorrect,
            correctChoices: data.correctChoices,
          },
        });
        return next;
      });
    } catch (err) {
      console.error("answer failed", err);
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (currentIndex < total - 1) setCurrentIndex(currentIndex + 1);
  }
  function prev() {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      )
        return;
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Enter") {
        // Enter = "next" only if you've answered (preserve "lock-in" feeling).
        if (itemFullyDone) next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentIndex, itemFullyDone, total]);

  if (!current) {
    return (
      <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <div className="mx-auto max-w-2xl px-4 py-10 text-center">
          <p className="text-neutral-500">이 시험에는 문제가 없습니다.</p>
          <Link
            to="/"
            className="mt-4 inline-block text-sm text-neutral-700 underline"
          >
            ← 메인으로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:mb-8">
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            className="text-sm text-neutral-500 hover:text-neutral-900 sm:text-base dark:hover:text-neutral-100"
          >
            ← 메인
          </button>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-sm sm:text-base font-medium text-neutral-800 dark:text-neutral-200">
              {test.name}
            </span>
            <KindBadge kind={test.kind} />
            <span className="text-xs tabular-nums text-neutral-500 sm:text-sm">
              {currentIndex + 1} / {total}
            </span>
            <button
              type="button"
              onClick={() => setListOpen(true)}
              aria-label="문제 목록 열기"
              title="문제 목록"
              className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-sm text-neutral-700 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600"
            >
              ☰ <span className="hidden sm:inline">목록</span>
            </button>
          </div>
        </header>

        <WordTestListSidebar
          open={listOpen}
          onClose={() => setListOpen(false)}
          items={items}
          statuses={itemStatuses}
          activeIndex={currentIndex}
          onJump={(i) => {
            setCurrentIndex(i);
            setListOpen(false);
          }}
          testName={test.name}
          testKind={test.kind}
          answeredCount={answeredCount}
          correctCount={correctCount}
        />

        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className="h-full bg-neutral-900 transition-all dark:bg-neutral-100"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {test.kind === "meaning" ? (
          <MeaningCard
            item={current}
            choices={meaningKindChoices}
            picked={meaningPicked}
            submitting={submitting}
            onPick={pickMeaningKind}
          />
        ) : (
          <ReadingCard
            item={current}
            readingChoices={readingChoices}
            meaningChoices={meaningChoicesForReading}
            picks={readingPicksFor}
            submitting={submitting}
            onPick={pickReading}
          />
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <NavBtn
              disabled={currentIndex === 0}
              onClick={prev}
              label="◀ 이전"
            />
            <NavBtn
              disabled={currentIndex >= total - 1}
              onClick={next}
              label={itemFullyDone ? "다음 ▶" : "건너뛰기 →"}
            />
          </div>
          <div className="text-sm tabular-nums text-neutral-500">
            맞춤 {correctCount} / {answeredCount}
          </div>
        </div>

        {finishedAll && (
          <div className="mt-8 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <h3 className="text-lg font-semibold text-emerald-900 dark:text-emerald-200">
              시험 완료!
            </h3>
            <p className="mt-2 text-base text-emerald-900 dark:text-emerald-200">
              {correctCount} / {total} 정답 (
              {Math.round((correctCount / total) * 100)}%)
            </p>
            <Link
              to="/"
              className="mt-4 inline-block rounded-md border border-emerald-400 bg-white px-4 py-2 text-sm text-emerald-900 hover:border-emerald-600 dark:bg-neutral-900 dark:text-emerald-200"
            >
              메인으로
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

// ─── meaning kind card ───────────────────────────────────────────────────────

function MeaningCard({
  item,
  choices,
  picked,
  submitting,
  onPick,
}: {
  item: ItemWithExample;
  choices: string[];
  picked: Pick_ | null;
  submitting: boolean;
  onPick: (choice: string) => void;
}) {
  const { play, loading: ttsLoading, loadingText } = useTtsPlayer();
  const ttsForWord = loadingText === item.word;
  const reveal = picked !== null;
  const promptKind: "jp" | "ko" = item.mode === "jp_to_ko" ? "jp" : "ko";
  const choicesKind: "jp" | "ko" = item.mode === "jp_to_ko" ? "ko" : "jp";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-10 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2 flex items-center gap-2">
        <ModeBadge mode={item.mode ?? "jp_to_ko"} />
      </div>

      <div className="mt-2 text-center">
        {promptKind === "jp" ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-semibold text-neutral-900 sm:text-5xl dark:text-neutral-100 [font-family:'Noto_Sans_JP',sans-serif]">
                {item.word}
              </span>
              <button
                type="button"
                disabled={ttsLoading}
                onClick={() => play(item.word)}
                aria-label="단어 발음"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-base text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {ttsForWord ? <Spinner className="h-4 w-4" /> : "♪"}
              </button>
            </div>
            <span
              className={`text-base sm:text-lg [font-family:'Noto_Sans_JP',sans-serif] ${
                reveal ? "text-neutral-500" : "text-transparent select-none"
              }`}
            >
              {item.wordReading}
            </span>
          </div>
        ) : (
          <div className="text-2xl font-semibold text-neutral-900 sm:text-3xl dark:text-neutral-100">
            {item.meaningsKo.join(" · ")}
          </div>
        )}
      </div>

      <div className="mt-6 sm:mt-8">
        <ChoiceGrid
          choices={choices}
          picked={picked}
          submitting={submitting}
          onPick={onPick}
          japanese={choicesKind === "jp"}
        />
      </div>

      {picked && <ResultRow item={item} picked={picked} showWordCard />}
    </div>
  );
}

// ─── reading kind card ───────────────────────────────────────────────────────

function ReadingCard({
  item,
  readingChoices,
  meaningChoices,
  picks,
  submitting,
  onPick,
}: {
  item: ItemWithExample;
  readingChoices: string[];
  meaningChoices: string[];
  picks: ReadingPicks | null;
  submitting: boolean;
  onPick: (choice: string, sub: ReadingSubPick) => void;
}) {
  const { play, loading: ttsLoading, loadingText } = useTtsPlayer();
  const sentencePlain = item.example
    ? tokensToPlain(item.example.sentence)
    : "";
  const sentenceTtsLoading = !!sentencePlain && loadingText === sentencePlain;

  const readingPicked = picks?.reading ?? null;
  const meaningPicked = picks?.meaning ?? null;
  // Reveal target reading once the reading sub-pick is locked in (regardless of correctness).
  const showTargetReading = readingPicked !== null;
  // Reveal Korean translation only after BOTH sub-picks are answered.
  const showTranslation =
    readingPicked !== null && meaningPicked !== null;
  const meaningEnabled = readingPicked !== null;

  // Example-level explanation (cached on the source example row, shared with the word pack).
  const [exampleExpl, setExampleExpl] = useState<ExampleExplanation | null>(
    item.example?.explanation ?? null,
  );
  const [exampleExplOpen, setExampleExplOpen] = useState(false);
  const [exampleExplStatus, setExampleExplStatus] = useState<ExampleExplStatus>(
    { kind: "idle" },
  );
  const [showExplRegenModal, setShowExplRegenModal] = useState(false);
  const [showKanjiModal, setShowKanjiModal] = useState(false);

  // Reset explanation/modal state when the card changes.
  useEffect(() => {
    setExampleExpl(item.example?.explanation ?? null);
    setExampleExplOpen(false);
    setExampleExplStatus({ kind: "idle" });
    setShowKanjiModal(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function fetchExplanation(tier: "default" | "premium") {
    if (!item.example) return;
    const exampleId = item.example.id;
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
      setExampleExpl(data.explanation);
      setExampleExplStatus({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setExampleExplStatus({ kind: "error", message });
    }
  }

  function toggleExplanation() {
    if (!item.example) return;
    if (!exampleExpl) fetchExplanation("default");
    else setExampleExplOpen((v) => !v);
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-10 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-center gap-2">
        {item.focusKanji && (
          <button
            type="button"
            onClick={() => setShowKanjiModal(true)}
            title={`출처 한자 — ${item.focusKanji.character} (${item.focusKanji.packKey}). 클릭하면 한자 카드`}
            className="group inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-base text-neutral-800 transition hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <span className="text-lg leading-none [font-family:'Noto_Sans_JP',sans-serif]">
              {item.focusKanji.character}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-neutral-500 group-hover:text-neutral-700 dark:text-neutral-400 dark:group-hover:text-neutral-200">
              한자 카드
            </span>
          </button>
        )}
        <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sky-700 dark:bg-sky-950 dark:text-sky-300">
          한자 읽기
        </span>
      </div>

      {showKanjiModal && item.focusKanji && (
        <KanjiHintModal
          kanji={item.focusKanji}
          onClose={() => setShowKanjiModal(false)}
        />
      )}

      {item.example ? (
        <>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:p-6 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex items-start gap-3">
              <p className="flex-1 text-lg leading-loose text-neutral-800 sm:text-2xl dark:text-neutral-200 [font-family:'Noto_Sans_JP',sans-serif]">
                <SentenceRender
                  tokens={item.example.sentence as SentenceToken[]}
                  revealTarget={showTargetReading}
                  wordReading={item.wordReading}
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
                  {sentenceTtsLoading ? <Spinner className="h-4 w-4" /> : "♪"}
                </button>
                <button
                  type="button"
                  disabled={exampleExplStatus.kind === "loading"}
                  onClick={toggleExplanation}
                  aria-label="예문 해설"
                  aria-pressed={exampleExplOpen}
                  title="예문 전체에 대한 해설 (늬앙스/문법/표현)"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-base transition disabled:opacity-50 ${
                    exampleExplOpen
                      ? "border-sky-400 bg-sky-50 text-sky-900 dark:border-sky-500 dark:bg-sky-950 dark:text-sky-200"
                      : "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  {exampleExplStatus.kind === "loading" ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <span aria-hidden>📖</span>
                  )}
                </button>
              </div>
            </div>
            {item.example.sentenceTranslationKo && (
              <p
                className={`mt-3 text-sm transition-colors duration-300 sm:text-base ${
                  showTranslation
                    ? "text-neutral-500 dark:text-neutral-400"
                    : "select-none text-transparent"
                }`}
                aria-hidden={!showTranslation}
              >
                {item.example.sentenceTranslationKo}
              </p>
            )}
          </div>

          {exampleExplOpen && (
            <ExampleExplanationPanel
              explanation={exampleExpl}
              status={exampleExplStatus}
              onRegenerate={() => setShowExplRegenModal(true)}
              onRetry={() => fetchExplanation("default")}
            />
          )}

          <ConfirmModal
            open={showExplRegenModal}
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
            onConfirm={() => {
              setShowExplRegenModal(false);
              fetchExplanation("premium");
            }}
            onCancel={() => setShowExplRegenModal(false)}
          />
        </>
      ) : (
        <NoExampleFallback item={item} />
      )}

      {/* Step 1: pick the reading */}
      <SubSection
        step="1 / 2"
        label="발음"
        active={!readingPicked}
        done={!!readingPicked}
      >
        <ChoiceGrid
          choices={readingChoices}
          picked={readingPicked}
          submitting={submitting}
          onPick={(c) => onPick(c, "reading")}
          japanese
        />
        {readingPicked && (
          <MiniResult
            picked={readingPicked}
            hint="발음"
            correctText={item.wordReading}
          />
        )}
      </SubSection>

      {/* Step 2: pick the meaning */}
      <SubSection
        step="2 / 2"
        label="뜻"
        active={meaningEnabled && !meaningPicked}
        done={!!meaningPicked}
        disabled={!meaningEnabled}
      >
        <ChoiceGrid
          choices={meaningChoices}
          picked={meaningPicked}
          submitting={submitting}
          onPick={(c) => onPick(c, "meaning")}
          disabled={!meaningEnabled}
        />
        {meaningPicked && (
          <MiniResult
            picked={meaningPicked}
            hint="뜻"
            correctText={item.meaningsKo.join(" · ")}
          />
        )}
      </SubSection>

      {readingPicked && meaningPicked && (
        <div className="mt-5 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600 dark:bg-neutral-950 dark:text-neutral-400">
          {item.word} ({item.wordReading}) — {item.meaningsKo.join(", ")}
        </div>
      )}
    </div>
  );
}

function SubSection({
  step,
  label,
  active,
  done,
  disabled,
  children,
}: {
  step: string;
  label: string;
  active: boolean;
  done: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mt-5 rounded-xl border p-4 transition sm:mt-6 sm:p-5 ${
        disabled
          ? "border-neutral-200 bg-neutral-50/40 opacity-60 dark:border-neutral-800 dark:bg-neutral-950"
          : active
            ? "border-sky-300 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/20"
            : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
          {step}
        </span>
        <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          {label}
        </span>
        {done && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            ✓
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function MiniResult({
  picked,
  hint,
  correctText,
}: {
  picked: Pick_;
  hint: string;
  correctText: string;
}) {
  return (
    <div className="mt-3 text-sm">
      <span
        className={`font-medium ${
          picked.isCorrect ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {picked.isCorrect ? `${hint} 정답!` : `${hint} 틀림`}
      </span>
      {!picked.isCorrect && (
        <span className="ml-3 text-neutral-600 dark:text-neutral-300">
          정답 — {correctText}
        </span>
      )}
    </div>
  );
}

function KanjiHintModal({
  kanji,
  onClose,
}: {
  kanji: FocusKanji;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-neutral-900/40" onClick={onClose} />
      <div className="relative w-full max-w-3xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute -top-3 -right-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          ✕
        </button>
        <KanjiCard kanji={kanji} readings={kanji.readings} />
      </div>
    </div>
  );
}

function NoExampleFallback({ item }: { item: ItemWithExample }) {
  const revalidator = useRevalidator();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function generate() {
    if (!item.sourceWordId) {
      setStatus({
        kind: "error",
        message: "원본 단어가 사라져서 예문을 만들 수 없어요.",
      });
      return;
    }
    setStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/example", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId: item.sourceWordId, tier: "default" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      const data = (await res.json()) as { usage?: ApiUsage | null };
      if (data.usage) showUsageToast("✦ 예문 생성", data.usage);
      // Re-run loader; the new example shows up in this card.
      revalidator.revalidate();
      setStatus({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center dark:border-neutral-700 dark:bg-neutral-950">
      <div className="mb-2 text-3xl font-semibold text-neutral-900 sm:text-4xl dark:text-neutral-100 [font-family:'Noto_Sans_JP',sans-serif]">
        {item.word}
      </div>
      <p className="text-sm text-neutral-500">
        이 단어에 등록된 예문이 없습니다.
      </p>
      {status.kind === "error" && (
        <p className="mt-2 text-sm text-rose-600">{status.message}</p>
      )}
      <button
        type="button"
        disabled={status.kind === "loading"}
        onClick={generate}
        className="mt-3 inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {status.kind === "loading" ? (
          <>
            <Spinner className="h-3.5 w-3.5" />
            예문 생성 중…
          </>
        ) : (
          <>✦ 예문 생성</>
        )}
      </button>
    </div>
  );
}

// ─── shared bits ─────────────────────────────────────────────────────────────

function ChoiceGrid({
  choices,
  picked,
  submitting,
  onPick,
  disabled,
  japanese,
}: {
  choices: string[];
  picked: Pick_ | null;
  submitting: boolean;
  onPick: (choice: string) => void;
  disabled?: boolean;
  japanese?: boolean;
}) {
  return (
    <div className="grid gap-2.5 sm:gap-3 sm:grid-cols-2">
      {choices.map((choice) => {
        const isPicked = picked?.choice === choice;
        const isCorrect = picked?.correctChoices.includes(choice);
        const stateClass =
          picked === null
            ? disabled
              ? "border-neutral-200 bg-white opacity-50 dark:border-neutral-800 dark:bg-neutral-900"
              : "border-neutral-200 bg-white hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
            : isCorrect
              ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
              : isPicked
                ? "border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100"
                : "border-neutral-200 bg-white opacity-50 dark:border-neutral-800 dark:bg-neutral-900";
        return (
          <button
            key={choice}
            type="button"
            disabled={picked !== null || submitting || !!disabled}
            onClick={() => onPick(choice)}
            className={`rounded-xl border px-4 py-3 text-left text-base transition sm:px-5 sm:py-4 sm:text-lg ${
              japanese ? "[font-family:'Noto_Sans_JP',sans-serif]" : ""
            } ${stateClass}`}
          >
            {choice}
          </button>
        );
      })}
    </div>
  );
}

function ResultRow({
  item,
  picked,
  showWordCard,
}: {
  item: ItemWithExample;
  picked: Pick_;
  showWordCard?: boolean;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span
        className={`text-base font-medium ${
          picked.isCorrect ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {picked.isCorrect ? "정답!" : "틀림"}
      </span>
      {!picked.isCorrect && (
        <span className="text-sm text-neutral-600 dark:text-neutral-300">
          정답 — {picked.correctChoices.join(" · ")}
        </span>
      )}
      {showWordCard && (
        <span className="text-sm text-neutral-500">
          {item.word} ({item.wordReading}) — {item.meaningsKo.join(", ")}
        </span>
      )}
    </div>
  );
}

function WordTestListSidebar({
  open,
  onClose,
  items,
  statuses,
  activeIndex,
  onJump,
  testName,
  testKind,
  answeredCount,
  correctCount,
}: {
  open: boolean;
  onClose: () => void;
  items: ItemWithExample[];
  statuses: Array<"unanswered" | "correct" | "wrong">;
  activeIndex: number;
  onJump: (index: number) => void;
  testName: string;
  testKind: WordTestKind;
  answeredCount: number;
  correctCount: number;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    activeRef.current?.scrollIntoView({ block: "center" });
  }, [open]);

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-neutral-900/40 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-label="문제 목록"
        className={`absolute right-0 top-0 flex h-full w-[min(420px,100vw)] flex-col border-l border-neutral-200 bg-white shadow-xl transition-transform duration-200 ease-out dark:border-neutral-800 dark:bg-neutral-950 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
              {testName}
            </div>
            <div className="mt-0.5 text-xs text-neutral-500 tabular-nums">
              {testKind === "reading" ? "한자 읽기" : "단어 시험"} · 답변{" "}
              {answeredCount} / {items.length} · 맞춤 {correctCount}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            ✕
          </button>
        </header>
        <ol className="flex-1 overflow-y-auto py-2">
          {items.map((item, i) => {
            const isActive = i === activeIndex;
            const status = statuses[i];
            return (
              <li key={item.id}>
                <button
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  onClick={() => onJump(i)}
                  className={`flex w-full items-center gap-3 px-5 py-2.5 text-left transition ${
                    isActive
                      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                      : "text-neutral-800 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span
                    className={`w-7 shrink-0 text-xs tabular-nums ${
                      isActive
                        ? "opacity-70"
                        : "text-neutral-400 dark:text-neutral-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <StatusDot status={status} active={isActive} />
                  <span className="flex-1 truncate text-base [font-family:'Noto_Sans_JP',sans-serif]">
                    {item.word}
                  </span>
                  <span
                    className={`truncate text-xs ${
                      isActive
                        ? "opacity-70"
                        : "text-neutral-500 dark:text-neutral-400"
                    }`}
                  >
                    {item.meaningsKo[0] ?? ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

function StatusDot({
  status,
  active,
}: {
  status: "unanswered" | "correct" | "wrong";
  active: boolean;
}) {
  const cls =
    status === "correct"
      ? "bg-emerald-500"
      : status === "wrong"
        ? "bg-rose-500"
        : active
          ? "bg-neutral-400 dark:bg-neutral-500"
          : "bg-neutral-300 dark:bg-neutral-700";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

function KindBadge({ kind }: { kind: WordTestKind }) {
  const label = kind === "reading" ? "한자 읽기" : "단어 시험";
  const cls =
    kind === "reading"
      ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function ModeBadge({ mode }: { mode: WordTestMode }) {
  const label = mode === "jp_to_ko" ? "JP → KO" : "KO → JP";
  return (
    <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
      {label}
    </span>
  );
}

function NavBtn({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 transition hover:border-neutral-400 disabled:opacity-30 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
    >
      {label}
    </button>
  );
}
