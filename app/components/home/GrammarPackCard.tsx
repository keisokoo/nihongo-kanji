import { Link } from "react-router";
import type { HomeGrammarPack } from "~/lib/idb/home";
import { exportGrammarPack } from "~/lib/idb/grammar-pack-export";

export function GrammarPackCard({ pack }: { pack: HomeGrammarPack }) {
  const empty = pack.count === 0;

  async function downloadJson(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      const data = await exportGrammarPack(pack.key);
      if (data.items.length === 0) {
        alert("AI 해설이 아직 없습니다 — 다운로드 할 데이터 없음");
        return;
      }
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const date = data.exportedAt.slice(0, 10);
      const safeKey = data.key.replace(/[^A-Za-z0-9가-힣_-]+/g, "_");
      const filename = `nihongo-grammar-${safeKey}-${date}.json`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error("[GrammarPackCard] export failed:", err);
      alert(`팩 다운로드 실패: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  return (
    <div className="group relative">
      <Link
        to={`/grammar/${encodeURIComponent(pack.key)}`}
        prefetch="intent"
        aria-disabled={empty}
        onClick={(e) => {
          if (empty) e.preventDefault();
        }}
        className={`block rounded-xl border p-5 transition ${
          empty
            ? "border-neutral-200 bg-white/40 opacity-60 dark:border-neutral-800 dark:bg-neutral-900/40"
            : "border-neutral-200 bg-white hover:border-neutral-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
        }`}
      >
        <div className="text-2xl font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
          {pack.title}
        </div>
        <div className="mt-2 text-sm tabular-nums text-neutral-400">
          {empty ? "데이터 없음" : `${pack.count}개`}
        </div>
        {pack.description && (
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            {pack.description}
          </p>
        )}
      </Link>
      <button
        type="button"
        onClick={downloadJson}
        title="AI 해설만 delta 로 다운로드"
        aria-label="문법팩 AI 해설 다운로드"
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-sm text-neutral-500 opacity-30 transition hover:border-neutral-400 hover:text-neutral-800 group-hover:opacity-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        ⬇
      </button>
    </div>
  );
}
