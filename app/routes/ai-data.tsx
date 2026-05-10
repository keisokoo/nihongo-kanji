import { useState } from "react";
import { Link, useRevalidator } from "react-router";
import type { Route } from "./+types/ai-data";
import { loadAiData } from "~/lib/idb/ai-data";
import {
  clearExampleExplanations,
  clearGrammarExampleExplanations,
  clearGrammarItemExplanations,
  clearGrammarQuizExplanations,
  clearWordExplanations,
  deleteGeneratedExamples,
  deleteGeneratedGrammarExamples,
  deleteGeneratedGrammarQuizzes,
  deleteGeneratedWords,
} from "~/lib/idb/ai-data-actions";
import { ConfirmModal } from "~/components/ConfirmModal";
import { Spinner } from "~/components/Spinner";

export async function clientLoader() {
  return loadAiData();
}

export function meta() {
  return [{ title: "AI 생성물 — Nihongo" }];
}

const QUIZ_TYPE_LABELS: Record<string, string> = {
  conjugation: "활용",
  particle_blank: "조사 빈칸",
  pattern_blank: "문형 빈칸",
  form_meaning: "의미",
  ko_to_jp_form: "한↔일",
};

export default function AiData({ loaderData }: Route.ComponentProps) {
  const data = loaderData;
  const totalsValue = Object.values(data.totals).reduce((s, n) => s + n, 0);

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-6 flex items-center justify-between gap-3">
          <Link
            to="/stats"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ← 통계
          </Link>
          <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl dark:text-neutral-100">
            AI 생성물
          </h1>
          <span className="text-sm tabular-nums text-neutral-500">
            총 {totalsValue}
          </span>
        </header>

        {totalsValue === 0 && (
          <p className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400 dark:border-neutral-700">
            아직 AI 가 생성한 데이터가 없습니다.
          </p>
        )}

        <KindSection
          title="추가 단어 (한자팩)"
          total={data.totals.generatedWords}
          shown={data.generatedWords.length}
          action={
            <BulkActionButton
              label="삭제"
              variant="delete"
              action={deleteGeneratedWords}
              confirmTitle="AI 추가 단어 모두 삭제"
              confirmBody={
                <>
                  <p>
                    AI 가 추가한 단어 <strong>{data.totals.generatedWords}</strong>건
                    + 그 단어에 달린 예문을 모두 삭제합니다.
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">
                    시드 단어 / 시드 예문은 무손상.
                  </p>
                </>
              }
            />
          }
        >
          {data.generatedWords.map((w) => (
            <li key={w.id} className="ai-row">
              <Link
                to={
                  w.kanjiId
                    ? `/study/${encodeURIComponent(w.packKey)}/${w.kanjiId}?word=${encodeURIComponent(w.word)}`
                    : "/"
                }
                prefetch="intent"
                className="ai-link"
              >
                <div className="flex items-baseline gap-2 truncate">
                  <span className="text-base font-semibold [font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
                    {w.word}
                  </span>
                  <span className="text-xs text-neutral-500 [font-family:'Noto_Sans_JP',sans-serif]">
                    {w.wordReading}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-neutral-500">
                  {w.meaningsKo.join(", ")} ·{" "}
                  <span className="text-neutral-400">
                    {w.kanjiCharacter} / {w.packKey}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </KindSection>

        <KindSection
          title="추가 예문 (한자팩)"
          total={data.totals.generatedExamples}
          shown={data.generatedExamples.length}
          action={
            <BulkActionButton
              label="삭제"
              variant="delete"
              action={deleteGeneratedExamples}
              confirmTitle="AI 추가 예문 모두 삭제"
              confirmBody={
                <p>
                  AI 가 추가한 예문 <strong>{data.totals.generatedExamples}</strong>건을
                  모두 삭제합니다. 시드 예문 / 단어는 무손상.
                </p>
              }
            />
          }
        >
          {data.generatedExamples.map((e) => (
            <li key={e.id} className="ai-row">
              <Link
                to={`/study/${encodeURIComponent(e.packKey)}/${e.kanjiCharacter ? "" : ""}`}
                prefetch="intent"
                className="ai-link"
              >
                <div className="truncate text-sm [font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
                  {e.sentence}
                </div>
                <div className="mt-0.5 truncate text-xs text-neutral-500">
                  {e.translationKo} ·{" "}
                  <span className="text-neutral-400">
                    {e.word} ({e.kanjiCharacter})
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </KindSection>

        <KindSection
          title="단어 해설"
          total={data.totals.wordExplanations}
          shown={data.wordExplanations.length}
          action={
            <BulkActionButton
              label="초기화"
              variant="clear"
              action={clearWordExplanations}
              confirmTitle="단어 해설 모두 초기화"
              confirmBody={
                <p>
                  AI 가 만든 단어 해설 <strong>{data.totals.wordExplanations}</strong>건을
                  비웁니다. 단어 row 자체는 유지.
                </p>
              }
            />
          }
        >
          {data.wordExplanations.map((w) => (
            <li key={w.wordId} className="ai-row">
              <Link
                to={`/study/${encodeURIComponent(w.packKey)}/${w.kanjiCharacter ? "" : ""}?word=${encodeURIComponent(w.word)}`}
                prefetch="intent"
                className="ai-link"
              >
                <div className="flex items-baseline gap-2 truncate">
                  <span className="text-base font-semibold [font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
                    {w.word}
                  </span>
                  <span className="text-xs text-neutral-500 [font-family:'Noto_Sans_JP',sans-serif]">
                    {w.wordReading}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                  {w.reasoning || w.mnemonic}
                </p>
                <div className="mt-1 text-[10px] text-neutral-400">
                  {w.modelUsed}
                </div>
              </Link>
            </li>
          ))}
        </KindSection>

        <KindSection
          title="예문 해설"
          total={data.totals.exampleExplanations}
          shown={data.exampleExplanations.length}
          action={
            <BulkActionButton
              label="초기화"
              variant="clear"
              action={clearExampleExplanations}
              confirmTitle="예문 해설 모두 초기화"
              confirmBody={
                <p>
                  AI 가 만든 예문 해설 <strong>{data.totals.exampleExplanations}</strong>건을
                  비웁니다. 예문 row 자체는 유지.
                </p>
              }
            />
          }
        >
          {data.exampleExplanations.map((e) => (
            <li key={e.exampleId} className="ai-row">
              <Link
                to={`/study/${encodeURIComponent(e.packKey)}/${e.kanjiCharacter ? "" : ""}?word=${encodeURIComponent(e.word)}`}
                prefetch="intent"
                className="ai-link"
              >
                <div className="truncate text-sm [font-family:'Noto_Sans_JP',sans-serif] text-neutral-700 dark:text-neutral-300">
                  {e.sentence}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                  {e.preview}
                </p>
                <div className="mt-1 text-[10px] text-neutral-400">
                  {e.modelUsed}
                </div>
              </Link>
            </li>
          ))}
        </KindSection>

        <KindSection
          title="문법 항목 해설"
          total={data.totals.grammarItemExplanations}
          shown={data.grammarItemExplanations.length}
          action={
            <BulkActionButton
              label="초기화"
              variant="clear"
              action={clearGrammarItemExplanations}
              confirmTitle="문법 항목 해설 모두 초기화"
              confirmBody={
                <p>
                  문법 항목 deep 해설 <strong>{data.totals.grammarItemExplanations}</strong>건을
                  비웁니다. 시드 본문은 무손상.
                </p>
              }
            />
          }
        >
          {data.grammarItemExplanations.map((g) => (
            <li key={g.itemId} className="ai-row">
              <Link
                to={`/grammar/${encodeURIComponent(g.packKey)}/${g.itemId}`}
                prefetch="intent"
                className="ai-link"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-semibold [font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
                    {g.pattern}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                  {g.preview}
                </p>
                <div className="mt-1 text-[10px] text-neutral-400">
                  {g.modelUsed}
                </div>
              </Link>
            </li>
          ))}
        </KindSection>

        <KindSection
          title="문법 예문 해설"
          total={data.totals.grammarExampleExplanations}
          shown={data.grammarExampleExplanations.length}
          action={
            <BulkActionButton
              label="초기화"
              variant="clear"
              action={clearGrammarExampleExplanations}
              confirmTitle="문법 예문 해설 모두 초기화"
              confirmBody={
                <p>
                  문법 예문 해설 <strong>{data.totals.grammarExampleExplanations}</strong>건을
                  비웁니다. 예문 본문은 유지.
                </p>
              }
            />
          }
        >
          {data.grammarExampleExplanations.map((g) => (
            <li
              key={`${g.itemId}-${g.exampleIndex}`}
              className="ai-row"
            >
              <Link
                to={`/grammar/${encodeURIComponent(g.packKey)}/${g.itemId}`}
                prefetch="intent"
                className="ai-link"
              >
                <div className="truncate text-sm [font-family:'Noto_Sans_JP',sans-serif] text-neutral-700 dark:text-neutral-300">
                  {g.sentence}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                  {g.preview}
                </p>
                <div className="mt-1 text-[10px] text-neutral-400">
                  {g.pattern} · {g.modelUsed}
                </div>
              </Link>
            </li>
          ))}
        </KindSection>

        <KindSection
          title="문법 퀴즈 해설"
          total={data.totals.grammarQuizExplanations}
          shown={data.grammarQuizExplanations.length}
          action={
            <BulkActionButton
              label="초기화"
              variant="clear"
              action={clearGrammarQuizExplanations}
              confirmTitle="문법 퀴즈 해설 모두 초기화"
              confirmBody={
                <p>
                  문법 퀴즈 해설 <strong>{data.totals.grammarQuizExplanations}</strong>건을
                  비웁니다. 퀴즈 본문은 유지.
                </p>
              }
            />
          }
        >
          {data.grammarQuizExplanations.map((g) => (
            <li key={`${g.itemId}-${g.quizIndex}`} className="ai-row">
              <Link
                to={`/grammar/${encodeURIComponent(g.packKey)}/${g.itemId}`}
                prefetch="intent"
                className="ai-link"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    {QUIZ_TYPE_LABELS[g.quizType] ?? g.quizType}
                  </span>
                  <span className="text-base font-semibold [font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
                    {g.pattern}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                  {g.preview}
                </p>
                <div className="mt-1 text-[10px] text-neutral-400">
                  {g.modelUsed}
                </div>
              </Link>
            </li>
          ))}
        </KindSection>

        <KindSection
          title="문법 추가 예문"
          total={data.totals.generatedGrammarExamples}
          shown={data.generatedGrammarExamples.length}
          action={
            <BulkActionButton
              label="삭제"
              variant="delete"
              action={deleteGeneratedGrammarExamples}
              confirmTitle="문법 추가 예문 모두 삭제"
              confirmBody={
                <p>
                  AI 가 추가한 문법 예문 <strong>{data.totals.generatedGrammarExamples}</strong>건을
                  삭제합니다. 시드 예문은 무손상.
                </p>
              }
            />
          }
        >
          {data.generatedGrammarExamples.map((g, i) => (
            <li key={`${g.itemId}-gex-${i}`} className="ai-row">
              <Link
                to={`/grammar/${encodeURIComponent(g.packKey)}/${g.itemId}`}
                prefetch="intent"
                className="ai-link"
              >
                <div className="truncate text-sm [font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
                  {g.sentence}
                </div>
                <div className="mt-0.5 truncate text-xs text-neutral-500">
                  {g.translationKo} ·{" "}
                  <span className="text-neutral-400">{g.pattern}</span>
                </div>
              </Link>
            </li>
          ))}
        </KindSection>

        <KindSection
          title="문법 추가 퀴즈"
          total={data.totals.generatedGrammarQuizzes}
          shown={data.generatedGrammarQuizzes.length}
          action={
            <BulkActionButton
              label="삭제"
              variant="delete"
              action={deleteGeneratedGrammarQuizzes}
              confirmTitle="문법 추가 퀴즈 모두 삭제"
              confirmBody={
                <p>
                  AI 가 추가한 문법 퀴즈 <strong>{data.totals.generatedGrammarQuizzes}</strong>건을
                  삭제합니다. 시드 퀴즈는 무손상.
                </p>
              }
            />
          }
        >
          {data.generatedGrammarQuizzes.map((g, i) => (
            <li key={`${g.itemId}-gq-${i}`} className="ai-row">
              <Link
                to={`/grammar/${encodeURIComponent(g.packKey)}/${g.itemId}`}
                prefetch="intent"
                className="ai-link"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    {QUIZ_TYPE_LABELS[g.quizType] ?? g.quizType}
                  </span>
                  <span className="text-base font-semibold [font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
                    {g.pattern}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-neutral-500">
                  답: {g.answer}
                </div>
              </Link>
            </li>
          ))}
        </KindSection>
      </div>

      <style>{`
        .ai-row { display: block; }
        .ai-link { display: block; padding: 0.75rem; border-radius: 0.5rem; border: 1px solid; transition: border-color 150ms; }
      `}</style>
    </main>
  );
}

function KindSection({
  title,
  total,
  shown,
  action,
  children,
}: {
  title: string;
  total: number;
  shown: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (total === 0) return null;
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-neutral-400">
            {shown} / {total} 표시
          </span>
          {action}
        </div>
      </div>
      <ul className="space-y-2 [&_.ai-link]:border-neutral-200 [&_.ai-link]:bg-white [&_.ai-link:hover]:border-neutral-400 dark:[&_.ai-link]:border-neutral-800 dark:[&_.ai-link]:bg-neutral-900 dark:[&_.ai-link:hover]:border-neutral-600">
        {children}
      </ul>
    </section>
  );
}

type BulkResult = number | { words: number; examples: number };

function BulkActionButton({
  label,
  variant,
  action,
  confirmTitle,
  confirmBody,
}: {
  label: string;
  variant: "delete" | "clear";
  action: () => Promise<BulkResult>;
  confirmTitle: string;
  confirmBody: React.ReactNode;
}) {
  const revalidator = useRevalidator();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function execute() {
    setOpen(false);
    setBusy(true);
    try {
      const r = await action();
      let summary: string;
      if (typeof r === "number") summary = `${r}건 처리됨`;
      else summary = `단어 ${r.words}건 + 예문 ${r.examples}건 삭제됨`;
      revalidator.revalidate();
      if (typeof window !== "undefined") {
        window.alert(`${label} 완료 — ${summary}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      if (typeof window !== "undefined") window.alert(`실패: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  const colorCls =
    variant === "delete"
      ? "border-rose-300 text-rose-700 hover:border-rose-400 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/30"
      : "border-amber-300 text-amber-700 hover:border-amber-400 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-950/30";

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs disabled:opacity-50 ${colorCls}`}
      >
        {busy && <Spinner className="h-3 w-3" />}
        {label}
      </button>
      <ConfirmModal
        open={open}
        title={confirmTitle}
        body={confirmBody}
        confirmLabel={label}
        destructive={variant === "delete"}
        onConfirm={execute}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
