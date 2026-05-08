import { Link, redirect } from "react-router";
import type { Route } from "./+types/study";
import { db, kanji as kanjiTable } from "~/lib/db";
import { eq } from "drizzle-orm";
import { KanjiCard } from "~/components/KanjiCard";

const LEVELS = ["N5", "N4", "N3"] as const;
type Level = (typeof LEVELS)[number];

function isLevel(value: string): value is Level {
  return (LEVELS as readonly string[]).includes(value);
}

export async function loader({ params }: Route.LoaderArgs) {
  if (!isLevel(params.level)) throw redirect("/");

  const list = await db.query.kanji.findMany({
    where: eq(kanjiTable.level, params.level),
    with: { readings: true },
    orderBy: (k, { asc }) => asc(k.id),
    limit: 50,
  });

  return { level: params.level, list };
}

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Nihongo — ${params.level} 한자` }];
}

export default function Study({ loaderData }: Route.ComponentProps) {
  const { level, list } = loaderData;

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <Link
              to="/"
              className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              ← 레벨 선택
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {level} 한자
            </h1>
          </div>
          <span className="text-sm text-neutral-500">{list.length}자</span>
        </header>

        {list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
            아직 한자가 등록되지 않았습니다.
          </div>
        ) : (
          <ul className="grid gap-4">
            {list.map((k) => (
              <li key={k.id}>
                <KanjiCard kanji={k} readings={k.readings} />
                <div className="mt-2 text-right">
                  <Link
                    to={`/quiz/${k.id}`}
                    className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                  >
                    퀴즈 풀기 →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
