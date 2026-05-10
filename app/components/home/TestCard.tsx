import { useState } from "react";
import { Link, useRevalidator } from "react-router";
import { Spinner } from "~/components/Spinner";
import { ConfirmModal } from "~/components/ConfirmModal";
import type { HomeTest } from "~/lib/idb/home";
import { deleteWordTest } from "~/lib/idb/word-test";
import { deleteGrammarTest } from "~/lib/idb/grammar-test";

export function TestCard({ test }: { test: HomeTest }) {
  const revalidator = useRevalidator();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pct =
    test.total > 0 ? Math.round((test.answered / test.total) * 100) : 0;

  const isGrammar = test.testKind === "grammar";
  const linkTo = isGrammar
    ? `/grammar-test/${test.id}`
    : `/word-test/${test.id}`;

  async function confirmDelete() {
    setShowConfirm(false);
    setDeleting(true);
    setError(null);
    try {
      if (isGrammar) await deleteGrammarTest(test.id);
      else await deleteWordTest(test.id);
      revalidator.revalidate();
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setError(message);
      setDeleting(false);
    }
  }

  return (
    <div className="group relative">
      <Link
        to={linkTo}
        prefetch="intent"
        className={`block rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600 ${
          deleting ? "pointer-events-none opacity-50" : ""
        }`}
      >
        <div className="flex items-center gap-2 pr-8">
          <span className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {test.name}
          </span>
          <KindBadge test={test} />
        </div>
        <div className="mt-1 text-xs text-neutral-500">
          {test.sourcePacks.join(" · ")}
        </div>
        <div className="mt-3 text-sm tabular-nums text-neutral-500">
          {test.answered} / {test.total}
          {test.answered > 0 && (
            <span className="ml-2 text-emerald-600 dark:text-emerald-400">
              정답률 {Math.round((test.correct / test.answered) * 100)}%
            </span>
          )}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className="h-full bg-neutral-900 transition-all dark:bg-neutral-100"
            style={{ width: `${pct}%` }}
          />
        </div>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      </Link>

      <button
        type="button"
        disabled={deleting}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setShowConfirm(true);
        }}
        title="시험장 삭제"
        aria-label="시험장 삭제"
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-500 opacity-30 transition hover:border-rose-400 hover:text-rose-600 group-hover:opacity-100 disabled:opacity-30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:text-rose-400"
      >
        {deleting ? (
          <Spinner className="h-3 w-3" />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          </svg>
        )}
      </button>

      <ConfirmModal
        open={showConfirm}
        title="시험장 삭제"
        body={
          <>
            <p>
              <strong>{test.name}</strong> 시험장을 삭제할까요?
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              지금까지 푼 답변과 진행도가 함께 삭제됩니다 (총 {test.total} 문제,
              답변 {test.answered}개).
            </p>
          </>
        }
        confirmLabel="삭제"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}

function KindBadge({ test }: { test: HomeTest }) {
  if (test.testKind === "grammar") {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        문법
      </span>
    );
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
        test.kind === "reading"
          ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
      }`}
    >
      {test.kind === "reading" ? "한자 읽기" : "단어 시험"}
    </span>
  );
}
