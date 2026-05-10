import { Link } from "react-router";
import type { HomeFoundation } from "~/lib/idb/home";
import { RULE_FAMILY_BY_ID } from "~/lib/grammar-families";

export function FoundationCard({ item }: { item: HomeFoundation }) {
  const familyTitle = item.ruleFamily
    ? (RULE_FAMILY_BY_ID.get(item.ruleFamily)?.title ?? null)
    : null;

  return (
    <Link
      to={`/grammar/${encodeURIComponent(item.packKey)}/${item.id}`}
      prefetch="intent"
      className="block rounded-xl border border-emerald-200 bg-white p-4 transition hover:border-emerald-400 hover:shadow-sm dark:border-emerald-900/50 dark:bg-neutral-900 dark:hover:border-emerald-700"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          기초
        </span>
        {familyTitle && (
          <span className="truncate text-[10px] text-neutral-500">
            {familyTitle}
          </span>
        )}
      </div>
      <div className="mt-1.5 text-2xl font-semibold leading-tight text-neutral-900 [font-family:'Noto_Sans_JP',sans-serif] dark:text-neutral-100">
        {item.pattern}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
        {item.meaningsKo.join(" · ")}
      </p>
    </Link>
  );
}
