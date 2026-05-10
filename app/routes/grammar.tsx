import { useEffect, useMemo, useRef, useState } from "react";
import { Link, redirect } from "react-router";
import type { Route } from "./+types/grammar";
import { db } from "~/lib/idb/db";
import { GrammarCard } from "~/components/grammar/GrammarCard";
import { GrammarExamples } from "~/components/grammar/GrammarExamples";
import { GrammarQuizSection } from "~/components/grammar/GrammarQuizSection";
import { SidebarSearch } from "~/components/SidebarSearch";
import { matchesAny } from "~/lib/search";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const id = Number(params.itemId);
  if (!Number.isFinite(id)) throw redirect("/");

  const d = db();
  const target = await d.grammarItems.get(id);
  if (!target) throw redirect("/");
  if (target.packKey !== params.packKey) {
    throw redirect(
      `/grammar/${encodeURIComponent(target.packKey)}/${target.id}`,
    );
  }

  const pack = await d.grammarPacks.get(target.packKey);
  const allInPack = await d.grammarItems
    .where("packKey")
    .equals(target.packKey)
    .sortBy("position");

  const idx = allInPack.findIndex((it) => it.id === target.id);
  const prev = idx > 0 ? allInPack[idx - 1] : null;
  const next = idx < allInPack.length - 1 ? allInPack[idx + 1] : null;
  const trimmed = allInPack.map((it) => ({
    id: it.id,
    pattern: it.pattern,
    romaji: it.romaji,
    meanings: it.meaningsKo,
  }));

  return {
    item: target,
    pack: pack ?? null,
    packKey: target.packKey,
    position: idx + 1,
    total: allInPack.length,
    prev: prev ? { id: prev.id, pattern: prev.pattern } : null,
    next: next ? { id: next.id, pattern: next.pattern } : null,
    allInPack: trimmed,
  };
}

export function meta({ data }: Route.MetaArgs) {
  return [
    {
      title: data?.item
        ? `${data.item.pattern} — ${data.pack?.title ?? data.packKey} | Nihongo`
        : "Nihongo",
    },
  ];
}

export default function Grammar({ loaderData }: Route.ComponentProps) {
  const {
    item,
    pack,
    packKey,
    position,
    total,
    prev,
    next,
    allInPack,
  } = loaderData;
  const [listOpen, setListOpen] = useState(false);

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 sm:mb-8">
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            className="text-sm text-neutral-500 hover:text-neutral-900 sm:text-base dark:hover:text-neutral-100"
          >
            ← 팩 선택
          </button>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <NavButton
              to={
                prev
                  ? `/grammar/${encodeURIComponent(packKey)}/${prev.id}`
                  : null
              }
              label="◀"
              longLabel="◀ 이전"
              hint={prev?.pattern}
            />
            <span className="text-sm tabular-nums text-neutral-500 sm:text-base">
              {pack?.title ?? packKey} · {position} / {total}
            </span>
            <NavButton
              to={
                next
                  ? `/grammar/${encodeURIComponent(packKey)}/${next.id}`
                  : null
              }
              label="▶"
              longLabel="다음 ▶"
              hint={next?.pattern}
            />
            <button
              type="button"
              onClick={() => setListOpen(true)}
              aria-label="문법 목록 열기"
              title="문법 목록"
              className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-700 transition hover:border-neutral-400 sm:px-3 sm:py-2 sm:text-base dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600"
            >
              ☰ <span className="hidden sm:inline">목록</span>
            </button>
          </div>
        </header>

        <GrammarItemListSidebar
          open={listOpen}
          onClose={() => setListOpen(false)}
          packKey={packKey}
          packTitle={pack?.title ?? packKey}
          items={allInPack}
          activeId={item.id}
        />

        <section className="mb-6">
          <GrammarCard item={item} />
        </section>

        {item.examples.length > 0 && (
          <section className="mb-6">
            <GrammarExamples
              itemId={item.id}
              examples={item.examples}
              pattern={item.pattern}
            />
          </section>
        )}

        <section>
          <GrammarQuizSection
            quizzes={item.quizzes}
            itemId={item.id}
            itemKey={item.id}
          />
        </section>
      </div>
    </main>
  );
}

function GrammarItemListSidebar({
  open,
  onClose,
  packKey,
  packTitle,
  items,
  activeId,
}: {
  open: boolean;
  onClose: () => void;
  packKey: string;
  packTitle: string;
  items: Array<{
    id: number;
    pattern: string;
    romaji: string | null;
    meanings: string[];
  }>;
  activeId: number;
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    return items.filter((it) =>
      matchesAny([it.pattern, it.romaji, ...it.meanings], query),
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
        aria-label="문법 목록"
        className={`absolute right-0 top-0 flex h-full w-[min(440px,100vw)] flex-col border-l border-neutral-200 bg-white shadow-xl transition-transform duration-200 ease-out dark:border-neutral-800 dark:bg-neutral-950 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              {packTitle}
            </div>
            <div className="text-sm text-neutral-700 dark:text-neutral-300">
              총 {items.length}개
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
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
              일치하는 항목 없음
            </li>
          ) : (
            filtered.map((it) => {
              const isActive = it.id === activeId;
              return (
                <li key={it.id}>
                  <Link
                    ref={isActive ? activeRef : undefined}
                    to={`/grammar/${encodeURIComponent(packKey)}/${it.id}`}
                    prefetch="intent"
                    onClick={onClose}
                    className={`flex items-baseline gap-3 px-5 py-2.5 transition ${
                      isActive
                        ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                        : "text-neutral-800 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <span className="shrink-0 text-base [font-family:'Noto_Sans_JP',sans-serif]">
                      {it.pattern}
                    </span>
                    <span
                      className={`flex-1 truncate text-xs ${
                        isActive
                          ? "opacity-90"
                          : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    >
                      {it.meanings.join(" · ")}
                    </span>
                  </Link>
                </li>
              );
            })
          )}
        </ol>
      </aside>
    </div>
  );
}

function NavButton({
  to,
  label,
  longLabel,
  hint,
}: {
  to: string | null;
  label: string;
  longLabel?: string;
  hint?: string;
}) {
  const cls =
    "rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm transition sm:px-4 sm:py-2 sm:text-base dark:border-neutral-800 dark:bg-neutral-900";
  const enabled =
    "text-neutral-800 hover:border-neutral-400 dark:text-neutral-200 dark:hover:border-neutral-600";
  const disabled = "text-neutral-300 dark:text-neutral-700";

  const content = (
    <>
      {longLabel ? (
        <>
          <span className="sm:hidden">{label}</span>
          <span className="hidden sm:inline">{longLabel}</span>
        </>
      ) : (
        label
      )}
      {hint && (
        <span className="ml-1 text-neutral-400 [font-family:'Noto_Sans_JP',sans-serif]">
          {hint}
        </span>
      )}
    </>
  );

  if (!to) {
    return (
      <span className={`${cls} ${disabled}`} aria-disabled>
        {content}
      </span>
    );
  }
  return (
    <Link to={to} className={`${cls} ${enabled}`} prefetch="intent">
      {content}
    </Link>
  );
}
