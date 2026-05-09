import { Link } from "react-router";
import type { HomeTest } from "~/lib/home.server";

export function TestCard({ test }: { test: HomeTest }) {
  const pct =
    test.total > 0 ? Math.round((test.answered / test.total) * 100) : 0;
  return (
    <Link
      to={`/word-test/${test.id}`}
      prefetch="intent"
      className="group block rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
    >
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {test.name}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
            test.kind === "reading"
              ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
          }`}
        >
          {test.kind === "reading" ? "한자 읽기" : "단어 시험"}
        </span>
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
    </Link>
  );
}
