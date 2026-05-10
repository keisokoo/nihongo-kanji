import { Link } from "react-router";
import type { HomeFamily } from "~/lib/idb/home";
import { FAMILY_GROUP_LABELS } from "~/lib/grammar-families";

export function FamilyCard({ family }: { family: HomeFamily }) {
  return (
    <Link
      to={`/family/${encodeURIComponent(family.id)}`}
      prefetch="intent"
      className="block rounded-xl border border-indigo-200 bg-white p-4 transition hover:border-indigo-400 hover:shadow-sm dark:border-indigo-900/50 dark:bg-neutral-900 dark:hover:border-indigo-700"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
          {FAMILY_GROUP_LABELS[family.group]}
        </span>
        <span className="text-xs tabular-nums text-neutral-400">
          {family.count}개
        </span>
      </div>
      <div className="mt-1.5 text-base font-semibold text-neutral-900 dark:text-neutral-100">
        {family.title}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
        {family.description}
      </p>
    </Link>
  );
}
