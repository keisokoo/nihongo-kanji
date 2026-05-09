import { Link } from "react-router";
import type { HomePack } from "~/lib/idb/home";
import { exportPack } from "~/lib/idb/pack-export";

export function PackCard({
  pack,
  showDescription,
}: {
  pack: HomePack;
  showDescription?: boolean;
}) {
  const empty = pack.count === 0;

  async function downloadJson(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      const data = await exportPack(pack.key);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const date = data.exportedAt.slice(0, 10);
      const safeKey = data.key.replace(/[^A-Za-z0-9가-힣_-]+/g, "_");
      const filename = `nihongo-${safeKey}-${data.kind}-${date}.json`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer release to allow the browser to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error("[PackCard] export failed:", err);
      alert(`팩 다운로드 실패: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  return (
    <div className="group relative">
      <Link
        to={`/study/${encodeURIComponent(pack.key)}`}
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
          {empty ? "데이터 없음" : `${pack.count}자`}
        </div>
        {showDescription && pack.description && (
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            {pack.description}
          </p>
        )}
      </Link>
      <button
        type="button"
        onClick={downloadJson}
        title={
          pack.kind === "jlpt"
            ? "AI 추가 데이터만 다운로드"
            : "팩 전체 다운로드"
        }
        aria-label="팩 다운로드"
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-sm text-neutral-500 opacity-30 transition hover:border-neutral-400 hover:text-neutral-800 group-hover:opacity-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        ⬇
      </button>
    </div>
  );
}
