import { useEffect, useRef, useState } from "react";
import { Link, redirect, useNavigate } from "react-router";
import { asc, eq, ne, sql } from "drizzle-orm";
import type { Route } from "./+types/study";
import {
  db,
  examples as examplesTable,
  kanji as kanjiTable,
  words as wordsTable,
  type Word,
} from "~/lib/db";
import { KanjiCard } from "~/components/KanjiCard";
import { WordQuizSection } from "~/components/WordQuizSection";
import { Spinner } from "~/components/Spinner";
import { showUsageToast, type ApiUsage } from "~/components/Toast";

const DISTRACTOR_POOL_SIZE = 200;

export async function loader({ params, request }: Route.LoaderArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw redirect("/");

  const target = await db.query.kanji.findFirst({
    where: eq(kanjiTable.id, id),
    with: {
      readings: true,
      words: true,
      pack: true,
    },
  });
  if (!target) throw redirect("/");
  if (target.packKey !== params.level) {
    throw redirect(`/study/${encodeURIComponent(target.packKey)}/${target.id}`);
  }

  const url = new URL(request.url);
  const wordParam = url.searchParams.get("word");
  const activeWord =
    (wordParam && target.words.find((w) => w.word === wordParam)) ||
    target.words[0] ||
    null;

  const initialExamples = activeWord
    ? await db.query.examples.findMany({
        where: eq(examplesTable.wordId, activeWord.id),
        orderBy: asc(examplesTable.id),
      })
    : [];

  // Distractor pool: random other word readings (excluding the active word's).
  const poolRows = activeWord
    ? await db
        .select({ wordReading: wordsTable.wordReading })
        .from(wordsTable)
        .where(ne(wordsTable.id, activeWord.id))
        .orderBy(sql`random()`)
        .limit(DISTRACTOR_POOL_SIZE)
    : [];
  const distractorPool = poolRows
    .map((r) => r.wordReading)
    .filter((r) => r !== activeWord?.wordReading);

  const allInPack = await db.query.kanji.findMany({
    where: eq(kanjiTable.packKey, target.packKey),
    orderBy: asc(kanjiTable.id),
    columns: { id: true, character: true, meaningKo: true },
  });
  const idx = allInPack.findIndex((k) => k.id === target.id);
  const prev = idx > 0 ? allInPack[idx - 1] : null;
  const next = idx < allInPack.length - 1 ? allInPack[idx + 1] : null;

  return {
    kanji: target,
    pack: target.pack,
    packKey: target.packKey,
    position: idx + 1,
    total: allInPack.length,
    prev,
    next,
    allInPack,
    words: target.words,
    activeWord,
    initialExamples,
    distractorPool,
  };
}

export function meta({ data }: Route.MetaArgs) {
  return [
    {
      title: data?.kanji
        ? `${data.kanji.character} — ${data.pack?.title ?? data.packKey} | Nihongo`
        : "Nihongo",
    },
  ];
}

export default function Study({ loaderData }: Route.ComponentProps) {
  const {
    kanji,
    pack,
    packKey,
    position,
    total,
    prev,
    next,
    allInPack,
    words,
    activeWord,
    initialExamples,
    distractorPool,
  } = loaderData;
  const navigate = useNavigate();
  const [listOpen, setListOpen] = useState(false);

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-[80rem] px-8 py-10">
        <header className="mb-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            className="text-base text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ← 팩 선택
          </button>
          <div className="flex items-center gap-3">
            <NavButton
              to={
                prev ? `/study/${encodeURIComponent(packKey)}/${prev.id}` : null
              }
              label="◀ 이전"
              hint={prev?.character}
            />
            <span className="text-base tabular-nums text-neutral-500">
              {pack?.title ?? packKey} · {position} / {total}
            </span>
            <NavButton
              to={
                next ? `/study/${encodeURIComponent(packKey)}/${next.id}` : null
              }
              label="다음 ▶"
              hint={next?.character}
            />
            <button
              type="button"
              onClick={() => setListOpen(true)}
              aria-label="한자 목록 열기"
              title="한자 목록"
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-700 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600"
            >
              ☰ 목록
            </button>
          </div>
        </header>

        <KanjiListSidebar
          open={listOpen}
          onClose={() => setListOpen(false)}
          packKey={packKey}
          packTitle={pack?.title ?? packKey}
          items={allInPack}
          activeId={kanji.id}
        />

        <section className="mb-8">
          <KanjiCard kanji={kanji} readings={kanji.readings} />
        </section>

        <section>
          {words.length === 0 || !activeWord ? (
            <EmptyWordsCta packKey={packKey} kanjiId={kanji.id} />
          ) : (
            <WordQuizSection
              key={`${kanji.id}:${activeWord.id}`}
              packKey={packKey}
              kanjiId={kanji.id}
              words={words}
              activeWord={activeWord}
              initialExamples={initialExamples}
              distractorPool={distractorPool}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function KanjiListSidebar({
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
  items: Array<{ id: number; character: string; meaningKo: string }>;
  activeId: number;
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);

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
        aria-label="한자 목록"
        className={`absolute right-0 top-0 flex h-full w-[min(420px,100vw)] flex-col border-l border-neutral-200 bg-white shadow-xl transition-transform duration-200 ease-out dark:border-neutral-800 dark:bg-neutral-950 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              {packTitle}
            </div>
            <div className="text-sm text-neutral-700 dark:text-neutral-300">
              총 {items.length}자
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
        <ol className="flex-1 overflow-y-auto py-2">
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <li key={item.id}>
                <Link
                  ref={isActive ? activeRef : undefined}
                  to={`/study/${encodeURIComponent(packKey)}/${item.id}`}
                  prefetch="intent"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-5 py-2.5 transition ${
                    isActive
                      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                      : "text-neutral-800 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span className="w-8 shrink-0 text-2xl font-semibold leading-none [font-family:'Noto_Sans_JP',sans-serif]">
                    {item.character}
                  </span>
                  <span
                    className={`flex-1 truncate text-sm ${
                      isActive
                        ? "opacity-90"
                        : "text-neutral-500 dark:text-neutral-400"
                    }`}
                  >
                    {item.meaningKo}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

function EmptyWordsCta({
  packKey,
  kanjiId,
}: {
  packKey: string;
  kanjiId: number;
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading"; tier: "default" | "premium" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function generate(tier: "default" | "premium") {
    setStatus({ kind: "loading", tier });
    try {
      const res = await fetch("/api/word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanjiId, tier }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      const data = (await res.json()) as {
        word: Word;
        usage?: ApiUsage | null;
      };
      if (data.usage) showUsageToast("✦ 단어 + 예문 생성", data.usage);
      navigate(
        `/study/${encodeURIComponent(packKey)}/${kanjiId}?word=${encodeURIComponent(data.word.word)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setStatus({ kind: "error", message });
    }
  }

  const isLoading = status.kind === "loading";

  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center dark:border-neutral-700">
      <p className="text-base text-neutral-500">아직 등록된 단어가 없습니다.</p>
      <p className="mt-1 text-sm text-neutral-400">
        AI로 이 한자를 쓰는 단어와 예문 1개를 같이 생성해보세요.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => generate("default")}
          className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-5 py-2.5 text-base text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isLoading && status.tier === "default" ? (
            <>
              <Spinner className="h-4 w-4" />
              단어 + 예문 생성 중…
            </>
          ) : (
            <>✦ 단어 생성 (Haiku)</>
          )}
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => generate("premium")}
          className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-700 hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          title="고품질 모델 — 비용 발생"
        >
          {isLoading && status.tier === "premium" ? (
            <>
              <Spinner className="h-3.5 w-3.5" />
              단어 + 예문 생성 중…
            </>
          ) : (
            <>고품질 (Sonnet)</>
          )}
        </button>
      </div>
      {status.kind === "error" && (
        <p className="mt-4 text-sm text-rose-600">
          단어 생성 실패: {status.message}
        </p>
      )}
    </div>
  );
}

function NavButton({
  to,
  label,
  hint,
}: {
  to: string | null;
  label: string;
  hint?: string;
}) {
  const cls =
    "rounded-md border border-neutral-200 bg-white px-4 py-2 text-base transition dark:border-neutral-800 dark:bg-neutral-900";
  const enabled =
    "text-neutral-800 hover:border-neutral-400 dark:text-neutral-200 dark:hover:border-neutral-600";
  const disabled = "text-neutral-300 dark:text-neutral-700";

  if (!to) {
    return (
      <span className={`${cls} ${disabled}`} aria-disabled>
        {label}
      </span>
    );
  }
  return (
    <Link to={to} className={`${cls} ${enabled}`} prefetch="intent">
      {label}
      {hint && (
        <span className="ml-1 text-neutral-400 [font-family:'Noto_Sans_JP',sans-serif]">
          {hint}
        </span>
      )}
    </Link>
  );
}
