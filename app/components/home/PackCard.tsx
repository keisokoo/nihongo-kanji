import { Link } from "react-router";
import type { HomePack } from "~/lib/home.server";

export function PackCard({
  pack,
  showDescription,
}: {
  pack: HomePack;
  showDescription?: boolean;
}) {
  const empty = pack.count === 0;
  return (
    <Link
      to={`/study/${encodeURIComponent(pack.key)}`}
      prefetch="intent"
      aria-disabled={empty}
      onClick={(e) => {
        if (empty) e.preventDefault();
      }}
      className={`group block rounded-xl border p-5 transition ${
        empty
          ? "border-neutral-200 bg-white/40 opacity-60 dark:border-neutral-800 dark:bg-neutral-900/40"
          : "border-neutral-200 bg-white hover:border-neutral-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
      }`}
    >
      <div className="text-2xl font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
        {pack.title}
      </div>
      <div className="mt-2 text-sm tabular-nums text-neutral-400">
        {empty ? "데이터 없음" : `${pack.count}자`}
      </div>
      {showDescription && pack.description && (
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
          {pack.description}
        </p>
      )}
    </Link>
  );
}
