import { Link, redirect } from "react-router";
import { asc, eq, ne, sql } from "drizzle-orm";
import type { Route } from "./+types/study";
import {
  db,
  examples as examplesTable,
  kanji as kanjiTable,
  words as wordsTable,
} from "~/lib/db";
import { KanjiCard } from "~/components/KanjiCard";
import { WordQuizSection } from "~/components/WordQuizSection";

const DISTRACTOR_POOL_SIZE = 200;

export async function loader({ params, request }: Route.LoaderArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw redirect("/");

  const target = await db.query.kanji.findFirst({
    where: eq(kanjiTable.id, id),
    with: {
      readings: true,
      words: true,
    },
  });
  if (!target) throw redirect("/");
  if (target.level !== params.level) {
    throw redirect(`/study/${target.level}/${target.id}`);
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

  const allInLevel = await db.query.kanji.findMany({
    where: eq(kanjiTable.level, target.level),
    orderBy: asc(kanjiTable.id),
    columns: { id: true, character: true },
  });
  const idx = allInLevel.findIndex((k) => k.id === target.id);
  const prev = idx > 0 ? allInLevel[idx - 1] : null;
  const next = idx < allInLevel.length - 1 ? allInLevel[idx + 1] : null;

  return {
    kanji: target,
    level: target.level,
    position: idx + 1,
    total: allInLevel.length,
    prev,
    next,
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
        ? `${data.kanji.character} — ${data.level} | Nihongo`
        : "Nihongo",
    },
  ];
}

export default function Study({ loaderData }: Route.ComponentProps) {
  const {
    kanji,
    level,
    position,
    total,
    prev,
    next,
    words,
    activeWord,
    initialExamples,
    distractorPool,
  } = loaderData;

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-[80rem] px-8 py-10">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="text-base text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ← 레벨 선택
          </Link>
          <div className="flex items-center gap-3">
            <NavButton
              to={prev ? `/study/${level}/${prev.id}` : null}
              label="◀ 이전"
              hint={prev?.character}
            />
            <span className="text-base tabular-nums text-neutral-500">
              {level} · {position} / {total}
            </span>
            <NavButton
              to={next ? `/study/${level}/${next.id}` : null}
              label="다음 ▶"
              hint={next?.character}
            />
          </div>
        </header>

        <section className="mb-8">
          <KanjiCard kanji={kanji} readings={kanji.readings} />
        </section>

        <section>
          {words.length === 0 || !activeWord ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-base text-neutral-500 dark:border-neutral-700">
              아직 등록된 단어가 없습니다.
            </div>
          ) : (
            <WordQuizSection
              key={`${kanji.id}:${activeWord.id}`}
              level={level}
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
