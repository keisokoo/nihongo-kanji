import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Nihongo — N3 한자 학습" },
    { name: "description", content: "N5/N4/N3 필수 한자 학습" },
  ];
}

const LEVELS = [
  { id: "N5", title: "N5", desc: "기초 한자" },
  { id: "N4", title: "N4", desc: "초급 한자" },
  { id: "N3", title: "N3", desc: "중급 한자" },
] as const;

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Nihongo
          </h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            N3 합격을 위한 N5/N4/N3 필수 한자 학습
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          {LEVELS.map((level) => (
            <Link
              key={level.id}
              to={`/study/${level.id}`}
              className="group rounded-xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
            >
              <div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                {level.title}
              </div>
              <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {level.desc}
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
