import { useState } from "react";
import type { Route } from "./+types/home";
import { loadHomeData } from "~/lib/home.server";
import { PackCard } from "~/components/home/PackCard";
import { TestCard } from "~/components/home/TestCard";
import { ImportButton } from "~/components/home/ImportButton";
import { CreateTestModal } from "~/components/home/CreateTestModal";

export async function loader() {
  return loadHomeData();
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Nihongo — 일본어 한자 학습" },
    { name: "description", content: "일본어 한자 학습" },
  ];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { jlpt, custom, tests } = loaderData;
  const [showTestModal, setShowTestModal] = useState(false);
  const packsForTest = [...jlpt, ...custom].filter((p) => p.wordCount > 0);

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-[80rem] px-4 py-10 sm:px-8 sm:py-16">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4 sm:mb-12">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl dark:text-neutral-100">
              Nihongo
            </h1>
            <p className="mt-2 text-sm text-neutral-600 sm:text-base dark:text-neutral-400">
              일본어 한자 학습
            </p>
          </div>
          <ImportButton />
        </header>

        <section className="mb-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            JLPT
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-5">
            {jlpt.map((pack) => (
              <PackCard key={pack.key} pack={pack} />
            ))}
          </div>
        </section>

        {custom.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              내 팩
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {custom.map((pack) => (
                <PackCard key={pack.key} pack={pack} showDescription />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              단어 시험
            </h2>
            <button
              type="button"
              onClick={() => setShowTestModal(true)}
              disabled={packsForTest.length === 0}
              title={
                packsForTest.length === 0
                  ? "팩에 단어가 등록되어야 시험을 만들 수 있어요"
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-400 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            >
              ✦ 시험 만들기
            </button>
          </div>
          {tests.length === 0 ? (
            <EmptyState>
              아직 만든 단어 시험이 없습니다. 시험 만들기로 시작해 보세요.
            </EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {tests.map((t) => (
                <TestCard key={t.id} test={t} />
              ))}
            </div>
          )}
        </section>
      </div>

      {showTestModal && (
        <CreateTestModal
          packs={packsForTest}
          onClose={() => setShowTestModal(false)}
        />
      )}
    </main>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
      {children}
    </div>
  );
}
