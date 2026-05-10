import { Link, redirect } from "react-router";
import type { Route } from "./+types/family";
import { loadFamily } from "~/lib/idb/family";
import {
  RULE_FAMILY_BY_ID,
  FAMILY_GROUP_LABELS,
} from "~/lib/grammar-families";
import { GrammarCard } from "~/components/grammar/GrammarCard";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const familyId = params.familyId;
  const meta = RULE_FAMILY_BY_ID.get(familyId);
  if (!meta) throw redirect("/");
  const data = await loadFamily(familyId);
  return { meta, data };
}

export function meta({ data }: Route.MetaArgs) {
  return [
    {
      title: data?.meta
        ? `${data.meta.title} — 룰 패밀리 | Nihongo`
        : "룰 패밀리",
    },
  ];
}

export default function FamilyPage({ loaderData }: Route.ComponentProps) {
  const { meta: familyMeta, data } = loaderData;
  const { foundation, members, byLevel } = data;

  const levels = Object.keys(byLevel).sort();
  const totalMembers = members.length;
  const derivedMembers = members.filter((m) => !m.isFoundation);

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-6">
          <Link
            to="/"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ← 메인
          </Link>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {FAMILY_GROUP_LABELS[familyMeta.group]}
            </span>
            <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl dark:text-neutral-100">
              {familyMeta.title}
            </h1>
            <span className="text-sm tabular-nums text-neutral-500">
              {totalMembers} 항목
            </span>
          </div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {familyMeta.description}
          </p>
          {levels.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              {levels.map((lv) => (
                <span
                  key={lv}
                  className="rounded bg-neutral-100 px-2 py-0.5 tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                >
                  {lv} {byLevel[lv]}
                </span>
              ))}
            </div>
          )}
        </header>

        {totalMembers === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
            <p className="text-base text-neutral-700 dark:text-neutral-300">
              이 family 에 속한 항목이 아직 없어요.
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              cowork 작업이 진행되면서 자동으로 채워집니다.
            </p>
          </div>
        ) : (
          <>
            {foundation && (
              <section className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                    📚 기초 항목
                  </h2>
                  <Link
                    to={`/grammar/${encodeURIComponent(foundation.packKey)}/${foundation.id}`}
                    prefetch="intent"
                    className="text-xs text-sky-600 underline hover:text-sky-700 dark:text-sky-400"
                  >
                    상세 페이지로 →
                  </Link>
                </div>
                <GrammarCard item={foundation} />
              </section>
            )}

            {derivedMembers.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  함께 쓰는 패턴 ({derivedMembers.length})
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {derivedMembers.map((m) => (
                    <li key={m.id}>
                      <Link
                        to={`/grammar/${encodeURIComponent(m.packKey)}/${m.id}`}
                        prefetch="intent"
                        className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
                      >
                        <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                          {m.level}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-semibold [font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
                            {m.pattern}
                          </div>
                          <div className="truncate text-xs text-neutral-500">
                            {m.meaningsKo.join(", ")}
                          </div>
                        </div>
                      </Link>
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
