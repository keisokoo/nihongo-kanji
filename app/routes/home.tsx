import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/home";
import {
  db,
  kanji as kanjiTable,
  packs as packsTable,
  JLPT_LEVELS,
  type Pack,
} from "~/lib/db";
import { Spinner } from "~/components/Spinner";

export async function loader() {
  const allPacks = await db.query.packs.findMany();

  const counts = await db
    .select({
      packKey: kanjiTable.packKey,
      count: sql<number>`count(*)::int`,
    })
    .from(kanjiTable)
    .groupBy(kanjiTable.packKey);
  const countByKey = new Map(counts.map((c) => [c.packKey, c.count]));

  // JLPT in canonical N5 → N1 (beginner first). Custom by created_at asc.
  const jlptRank = new Map<string, number>(
    JLPT_LEVELS.map((k, i) => [k, i]),
  );
  const jlpt = allPacks
    .filter((p) => p.kind === "jlpt")
    .sort((a, b) => (jlptRank.get(a.key) ?? 99) - (jlptRank.get(b.key) ?? 99));
  const custom = allPacks
    .filter((p) => p.kind === "custom")
    .sort((a, b) => +a.createdAt - +b.createdAt);

  return {
    jlpt: jlpt.map((p) => ({ ...p, count: countByKey.get(p.key) ?? 0 })),
    custom: custom.map((p) => ({ ...p, count: countByKey.get(p.key) ?? 0 })),
  };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Nihongo — 일본어 한자 학습" },
    { name: "description", content: "일본어 한자 학습" },
  ];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { jlpt, custom } = loaderData;

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-[80rem] px-8 py-16">
        <header className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Nihongo
          </h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            일본어 한자 학습
          </p>
        </header>

        <section className="mb-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            JLPT
          </h2>
          <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-5">
            {jlpt.map((pack) => (
              <PackCard key={pack.key} pack={pack} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              내 팩
            </h2>
            <ImportButton />
          </div>
          {custom.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
              아직 추가한 팩이 없습니다. JSON 파일을 가져와 보세요.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {custom.map((pack) => (
                <PackCard key={pack.key} pack={pack} showDescription />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PackCard({
  pack,
  showDescription,
}: {
  pack: Pack & { count: number };
  showDescription?: boolean;
}) {
  const empty = pack.count === 0;
  return (
    <Link
      to={`/study/${encodeURIComponent(pack.key)}`}
      prefetch="intent"
      aria-disabled={empty}
      onClick={(e) => {
        if (empty) e.preventDefault();
      }}
      className={`group block rounded-xl border p-5 transition ${
        empty
          ? "border-neutral-200 bg-white/40 opacity-60 dark:border-neutral-800 dark:bg-neutral-900/40"
          : "border-neutral-200 bg-white hover:border-neutral-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
      }`}
    >
      <div className="text-2xl font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
        {pack.title}
      </div>
      <div className="mt-2 text-sm tabular-nums text-neutral-400">
        {empty ? "데이터 없음" : `${pack.count}자`}
      </div>
      {showDescription && pack.description && (
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
          {pack.description}
        </p>
      )}
    </Link>
  );
}

function ImportButton() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading"; filename: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function onFile(file: File) {
    setStatus({ kind: "loading", filename: file.name });
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/pack/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      const data = (await res.json()) as { pack: Pack };
      setStatus({ kind: "idle" });
      // Navigate to the imported pack so the user sees the result.
      navigate(`/study/${encodeURIComponent(data.pack.key)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "import failed";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <div className="flex items-center gap-3">
      {status.kind === "error" && (
        <span className="text-xs text-rose-600">{status.message}</span>
      )}
      {status.kind === "loading" && (
        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
          <Spinner className="h-3.5 w-3.5" />
          {status.filename}
        </span>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = ""; // allow re-selecting same file
        }}
      />
      <button
        type="button"
        disabled={status.kind === "loading"}
        onClick={() => fileInput.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
      >
        + JSON 가져오기
      </button>
    </div>
  );
}
