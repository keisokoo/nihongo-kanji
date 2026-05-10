import { Link, useRevalidator } from "react-router";
import type { Route } from "./+types/favorites";
import { loadFavoritesData, toggleFavorite } from "~/lib/idb/favorites";
import { useState } from "react";

export async function clientLoader() {
  return loadFavoritesData();
}

export function meta() {
  return [{ title: "즐겨찾기 — Nihongo" }];
}

export default function Favorites({ loaderData }: Route.ComponentProps) {
  const { kanji, word, grammar, total } = loaderData;
  const revalidator = useRevalidator();

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-6 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ← 메인
          </Link>
          <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl dark:text-neutral-100">
            ★ 즐겨찾기
          </h1>
          <span className="text-sm tabular-nums text-neutral-500">
            총 {total}
          </span>
        </header>

        {total === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
            <p className="text-base text-neutral-700 dark:text-neutral-300">
              아직 즐겨찾기 한 항목이 없어요.
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              한자 / 단어 / 문법 상세 페이지에서 ☆ 별 아이콘을 누르면 여기 모입니다.
            </p>
          </div>
        ) : (
          <>
            {kanji.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  한자 ({kanji.length})
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {kanji.map((k) => (
                    <li key={k.id} className="group relative">
                      <Link
                        to={`/study/${encodeURIComponent(k.packKey)}/${k.id}`}
                        prefetch="intent"
                        className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
                      >
                        <span className="text-2xl font-semibold leading-none [font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
                          {k.character}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-neutral-700 dark:text-neutral-300">
                            {k.meaningKo}
                          </div>
                          <div className="text-xs text-neutral-400">
                            {k.packKey}
                          </div>
                        </div>
                      </Link>
                      <UnstarButton
                        kind="kanji"
                        id={k.id}
                        onChanged={() => revalidator.revalidate()}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {word.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  단어 ({word.length})
                </h2>
                <ul className="space-y-2">
                  {word.map((w) => (
                    <li key={w.id} className="group relative">
                      <Link
                        to={
                          w.kanjiId
                            ? `/study/${encodeURIComponent(w.packKey)}/${w.kanjiId}?word=${encodeURIComponent(w.word)}`
                            : "/"
                        }
                        prefetch="intent"
                        className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-base font-semibold [font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
                              {w.word}
                            </span>
                            <span className="text-xs text-neutral-500 [font-family:'Noto_Sans_JP',sans-serif]">
                              {w.wordReading}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-xs text-neutral-500">
                            {w.meaningsKo.join(", ")} ·{" "}
                            <span className="text-neutral-400">{w.packKey}</span>
                          </div>
                        </div>
                      </Link>
                      <UnstarButton
                        kind="word"
                        id={w.id}
                        onChanged={() => revalidator.revalidate()}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {grammar.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  문법 ({grammar.length})
                </h2>
                <ul className="space-y-2">
                  {grammar.map((g) => (
                    <li key={g.id} className="group relative">
                      <Link
                        to={`/grammar/${encodeURIComponent(g.packKey)}/${g.id}`}
                        prefetch="intent"
                        className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-base font-semibold [font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
                              {g.pattern}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-xs text-neutral-500">
                            {g.meaningsKo.join(", ")} ·{" "}
                            <span className="text-neutral-400">{g.packKey}</span>
                          </div>
                        </div>
                      </Link>
                      <UnstarButton
                        kind="grammar"
                        id={g.id}
                        onChanged={() => revalidator.revalidate()}
                      />
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

function UnstarButton({
  kind,
  id,
  onChanged,
}: {
  kind: "kanji" | "word" | "grammar";
  id: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        await toggleFavorite(kind, id);
        onChanged();
      }}
      title="즐겨찾기 해제"
      aria-label="즐겨찾기 해제"
      className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-500 opacity-30 transition hover:opacity-100 disabled:opacity-30 group-hover:opacity-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
    >
      ★
    </button>
  );
}
