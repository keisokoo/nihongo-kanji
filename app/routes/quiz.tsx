import { Link, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/quiz";
import { db, kanji as kanjiTable, readings as readingsTable } from "~/lib/db";
import { ExampleQuiz, type QuizQuestion } from "~/components/ExampleQuiz";

export async function loader({ params }: Route.LoaderArgs) {
  const id = Number(params.kanjiId);
  if (!Number.isFinite(id)) throw redirect("/");

  const target = await db.query.kanji.findFirst({
    where: eq(kanjiTable.id, id),
    with: {
      readings: true,
      examples: { with: { reading: true } },
    },
  });
  if (!target) throw redirect("/");

  // Distractor pool: other readings of the same level (any reading type).
  const pool = await db.query.readings.findMany({
    where: (r, { ne }) => ne(r.kanjiId, id),
    limit: 50,
  });

  const questions: QuizQuestion[] = target.examples.map((ex) => {
    const correct = ex.reading.reading;
    const distractors = sample(
      pool
        .map((r) => r.reading)
        .filter((r) => r !== correct),
      3,
    );
    const choices = shuffle([correct, ...distractors]);
    return {
      exampleId: ex.id,
      word: ex.word,
      sentence: ex.sentence,
      sentenceTranslationKo: ex.sentenceTranslationKo,
      readingType: ex.reading.type,
      correct,
      choices,
    };
  });

  return { kanji: target, questions };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Nihongo — ${data?.kanji.character ?? ""} 퀴즈` }];
}

export default function Quiz({ loaderData }: Route.ComponentProps) {
  const { kanji, questions } = loaderData;

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <header className="mb-8">
          <Link
            to={`/study/${kanji.level}`}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ← {kanji.level} 목록
          </Link>
          <h1 className="mt-1 flex items-baseline gap-3">
            <span className="text-5xl font-semibold text-neutral-900 dark:text-neutral-100 [font-family:'Noto_Sans_JP',sans-serif]">
              {kanji.character}
            </span>
            <span className="text-sm text-neutral-500">{kanji.meaningKo}</span>
          </h1>
        </header>

        {questions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
            아직 예문이 등록되지 않았습니다.
          </div>
        ) : (
          <ExampleQuiz questions={questions} />
        )}
      </div>
    </main>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}
