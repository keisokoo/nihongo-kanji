import { useEffect, useMemo, useRef, useState } from "react";
import { Link, redirect } from "react-router";
import type { Route } from "./+types/grammar-test";
import { db } from "~/lib/idb/db";
import {
  answerGrammarTestItem,
  loadFreshExplanationsForTest,
} from "~/lib/idb/grammar-test";
import type {
  GrammarItem,
  GrammarQuiz,
  GrammarQuizExplanation,
  GrammarTestItem,
} from "~/lib/idb/grammar-types";
import { ConjugationQuiz } from "~/components/grammar/quizzes/ConjugationQuiz";
import { BlankQuiz } from "~/components/grammar/quizzes/BlankQuiz";
import { FormMeaningQuiz } from "~/components/grammar/quizzes/FormMeaningQuiz";
import { KoToJpFormQuiz } from "~/components/grammar/quizzes/KoToJpFormQuiz";
import { GrammarCard } from "~/components/grammar/GrammarCard";
import { SidebarSearch } from "~/components/SidebarSearch";
import { matchesAny } from "~/lib/search";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw redirect("/");
  const d = db();
  const test = await d.grammarTests.get(id);
  if (!test) throw redirect("/");

  const items = await d.grammarTestItems
    .where("testId")
    .equals(id)
    .sortBy("position");

  // 시험 만든 후 사용자가 source item 의 quiz 에 📖 해설을 생성했을 수 있음.
  // 시험에서 같은 해설을 그대로 보여주려고 fresh 로 가져옴.
  const freshExpl = await loadFreshExplanationsForTest(items);

  // 모달용 source items 모음. 컴포넌트에서 Map 으로 변환.
  const sourceIds = [
    ...new Set(
      items.map((it) => it.sourceItemId).filter((x): x is number => x !== null),
    ),
  ];
  const rawSources =
    sourceIds.length > 0 ? await d.grammarItems.bulkGet(sourceIds) : [];
  const sourceItems = rawSources.filter((x): x is GrammarItem => !!x);

  return { test, items, freshExpl, sourceItems };
}

export function meta({ data }: Route.MetaArgs) {
  return [
    {
      title: data?.test ? `${data.test.name} — 문법 시험 | Nihongo` : "문법 시험",
    },
  ];
}

export default function GrammarTest({ loaderData }: Route.ComponentProps) {
  const { test, items, freshExpl, sourceItems } = loaderData;

  const sourceItemMap = useMemo(
    () => new Map(sourceItems.map((it) => [it.id, it])),
    [sourceItems],
  );

  // 시험의 난이도 라벨 — sourcePacks 첫 번째에서 N5 / N4 / ... 추출.
  // 다중 팩이면 "혼합".
  const levelLabel = useMemo(() => {
    if (test.sourcePacks.length === 0) return "";
    if (test.sourcePacks.length > 1) return "혼합";
    const m = /^([nN][1-5])-grammar$/.exec(test.sourcePacks[0]);
    return m ? m[1].toUpperCase() : test.sourcePacks[0];
  }, [test.sourcePacks]);

  const initialIndex = useMemo(() => {
    const firstUnanswered = items.findIndex((it) => it.answeredAt === null);
    return firstUnanswered === -1 ? 0 : firstUnanswered;
  }, [items]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [listOpen, setListOpen] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  // 답안 상태 캐시 — IDB 가 정본이지만 즉각 UI 반영 위해 로컬 미러.
  const [picks, setPicks] = useState<Map<number, { choice: string; isCorrect: boolean }>>(() => {
    const init = new Map<number, { choice: string; isCorrect: boolean }>();
    for (const it of items) {
      if (it.pickedChoice !== null && it.isCorrect !== null) {
        init.set(it.id, { choice: it.pickedChoice, isCorrect: it.isCorrect });
      }
    }
    return init;
  });

  const current = items[currentIndex];
  const total = items.length;

  const answeredCount = picks.size;
  const correctCount = useMemo(() => {
    let n = 0;
    for (const v of picks.values()) if (v.isCorrect) n++;
    return n;
  }, [picks]);
  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
  const finishedAll = answeredCount === total;

  const itemStatuses = useMemo(() => {
    return items.map((it) => {
      const p = picks.get(it.id);
      if (!p) return "unanswered" as const;
      return p.isCorrect ? ("correct" as const) : ("wrong" as const);
    });
  }, [items, picks]);

  async function pick(itemId: number, choice: string) {
    const existing = picks.get(itemId);
    if (existing) return; // 이미 답함 — re-pick 막음

    try {
      const data = await answerGrammarTestItem({ itemId, choice });
      setPicks((prev) => {
        const next = new Map(prev);
        next.set(itemId, { choice, isCorrect: data.isCorrect });
        return next;
      });
    } catch (err) {
      console.error("[grammar-test] pick failed:", err);
    }
  }

  function next() {
    if (currentIndex < total - 1) {
      setCurrentIndex(currentIndex + 1);
      setHintOpen(false);
    }
  }
  function prev() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setHintOpen(false);
    }
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
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentIndex, total]);

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

  const currentPick = picks.get(current.id) ?? null;

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
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
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              문법
            </span>
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

        <GrammarTestListSidebar
          open={listOpen}
          onClose={() => setListOpen(false)}
          items={items}
          statuses={itemStatuses}
          activeIndex={currentIndex}
          onJump={(i) => {
            setCurrentIndex(i);
            setListOpen(false);
            setHintOpen(false);
          }}
          testName={test.name}
          answeredCount={answeredCount}
          correctCount={correctCount}
        />

        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className="h-full bg-neutral-900 transition-all dark:bg-neutral-100"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <PatternRevealRow
          picked={!!currentPick}
          pattern={current.pattern}
          meaningsKo={current.meaningsKo}
          levelLabel={levelLabel}
          onOpen={() => setHintOpen(true)}
          hasSource={!!current.sourceItemId && sourceItemMap.has(current.sourceItemId)}
        />

        {hintOpen && (
          <GrammarHintModal
            sourceItem={
              current.sourceItemId
                ? (sourceItemMap.get(current.sourceItemId) ?? null)
                : null
            }
            fallback={{
              pattern: current.pattern,
              meaningsKo: current.meaningsKo,
            }}
            onClose={() => setHintOpen(false)}
          />
        )}

        <QuizRender
          key={current.id}
          itemId={current.id}
          quiz={current.quizSnapshot}
          sourceItemId={current.sourceItemId}
          sourceQuizIndex={current.sourceQuizIndex}
          freshExplanation={freshExpl.get(current.id) ?? null}
          picked={currentPick?.choice ?? null}
          onPick={(choice) => pick(current.id, choice)}
          stepLabel={`${currentIndex + 1} / ${total}`}
        />

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
              label={currentPick ? "다음 ▶" : "건너뛰기 →"}
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

function QuizRender({
  itemId,
  quiz,
  sourceItemId,
  sourceQuizIndex,
  freshExplanation,
  picked,
  onPick,
  stepLabel,
}: {
  itemId: number;
  quiz: GrammarQuiz;
  sourceItemId: number | null;
  sourceQuizIndex: number;
  freshExplanation: GrammarQuizExplanation | null;
  picked: string | null;
  onPick: (choice: string) => void;
  stepLabel: string;
}) {
  // 해설 저장은 source item 에. source 가 사라지면 explanation 기능 비활성화
  // (-1 인덱스 보내서 fetch 실패하게).
  const explItemId = sourceItemId ?? -1;
  const explIdx = sourceQuizIndex;

  const controlled = { picked, onPick };

  if (quiz.type === "conjugation") {
    return (
      <ConjugationQuiz
        step={stepLabel}
        payload={quiz.payload}
        itemId={explItemId}
        quizIndex={explIdx}
        initialExplanation={freshExplanation}
        controlled={controlled}
      />
    );
  }
  if (quiz.type === "particle_blank") {
    return (
      <BlankQuiz
        step={stepLabel}
        payload={quiz.payload}
        variant="particle"
        itemId={explItemId}
        quizIndex={explIdx}
        initialExplanation={freshExplanation}
        controlled={controlled}
      />
    );
  }
  if (quiz.type === "pattern_blank") {
    return (
      <BlankQuiz
        step={stepLabel}
        payload={quiz.payload}
        variant="pattern"
        itemId={explItemId}
        quizIndex={explIdx}
        initialExplanation={freshExplanation}
        controlled={controlled}
      />
    );
  }
  if (quiz.type === "form_meaning") {
    return (
      <FormMeaningQuiz
        step={stepLabel}
        payload={quiz.payload}
        itemId={explItemId}
        quizIndex={explIdx}
        initialExplanation={freshExplanation}
        controlled={controlled}
      />
    );
  }
  return (
    <KoToJpFormQuiz
      step={stepLabel}
      payload={quiz.payload}
      itemId={explItemId}
      quizIndex={explIdx}
      initialExplanation={freshExplanation}
      controlled={controlled}
    />
  );
}

function GrammarTestListSidebar({
  open,
  onClose,
  items,
  statuses,
  activeIndex,
  onJump,
  testName,
  answeredCount,
  correctCount,
}: {
  open: boolean;
  onClose: () => void;
  items: GrammarTestItem[];
  statuses: Array<"unanswered" | "correct" | "wrong">;
  activeIndex: number;
  onJump: (index: number) => void;
  testName: string;
  answeredCount: number;
  correctCount: number;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const indexed = items.map((it, i) => ({ item: it, idx: i }));
    if (!query.trim()) return indexed;
    return indexed.filter(({ item }) =>
      matchesAny([item.pattern, ...item.meaningsKo], query),
    );
  }, [items, query]);

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
        className={`absolute right-0 top-0 flex h-full w-[min(440px,100vw)] flex-col border-l border-neutral-200 bg-white shadow-xl transition-transform duration-200 ease-out dark:border-neutral-800 dark:bg-neutral-950 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
              {testName}
            </div>
            <div className="mt-0.5 text-xs text-neutral-500 tabular-nums">
              문법 · 답변 {answeredCount} / {items.length} · 맞춤 {correctCount}
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
        <SidebarSearch
          value={query}
          onChange={setQuery}
          count={filtered.length}
          total={items.length}
        />
        <ol className="flex-1 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <li className="px-5 py-6 text-center text-sm text-neutral-400">
              일치하는 문제 없음
            </li>
          ) : (
            filtered.map(({ item, idx }) => {
              const isActive = idx === activeIndex;
              const status = statuses[idx];
              return (
                <li key={item.id}>
                  <button
                    ref={isActive ? activeRef : undefined}
                    type="button"
                    onClick={() => onJump(idx)}
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
                      {idx + 1}
                    </span>
                    <StatusDot status={status} active={isActive} />
                    <span className="flex-1 truncate text-base [font-family:'Noto_Sans_JP',sans-serif]">
                      {item.pattern}
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
            })
          )}
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
  return (
    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />
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

/**
 * 퀴즈 위 한 줄 — picking 전엔 난이도만, picking 후엔 pattern + 의미를
 * 모달-열기 버튼으로. spoiler 방지.
 */
function PatternRevealRow({
  picked,
  pattern,
  meaningsKo,
  levelLabel,
  onOpen,
  hasSource,
}: {
  picked: boolean;
  pattern: string;
  meaningsKo: string[];
  levelLabel: string;
  onOpen: () => void;
  hasSource: boolean;
}) {
  if (!picked) {
    return (
      <div className="mb-2 text-xs text-neutral-500">
        <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
          난이도 {levelLabel}
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!hasSource}
      title={hasSource ? "문법 카드 열기" : "원본 문법 항목 없음"}
      className="mb-2 inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-600 transition hover:border-neutral-400 disabled:cursor-default disabled:opacity-70 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-600"
    >
      <span className="[font-family:'Noto_Sans_JP',sans-serif] text-neutral-800 dark:text-neutral-200">
        {pattern}
      </span>
      <span>{meaningsKo.join(" · ")}</span>
      {hasSource && (
        <span className="text-[10px] uppercase tracking-wide text-neutral-400">
          📖
        </span>
      )}
    </button>
  );
}

function GrammarHintModal({
  sourceItem,
  fallback,
  onClose,
}: {
  sourceItem: GrammarItem | null;
  fallback: { pattern: string; meaningsKo: string[] };
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
        <div className="max-h-[85vh] overflow-y-auto rounded-2xl">
          {sourceItem ? (
            <GrammarCard item={sourceItem} />
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="text-2xl font-semibold text-neutral-900 [font-family:'Noto_Sans_JP',sans-serif] dark:text-neutral-100">
                {fallback.pattern}
              </h3>
              <p className="mt-2 text-base text-neutral-700 dark:text-neutral-300">
                {fallback.meaningsKo.join(" · ")}
              </p>
              <p className="mt-4 text-sm text-neutral-500">
                원본 문법 항목이 삭제되어 상세 정보를 보여줄 수 없어요.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
