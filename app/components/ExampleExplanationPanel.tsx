import type { ExampleExplanation } from "~/lib/db";
import { Spinner } from "./Spinner";

export type ExampleExplStatus =
  | { kind: "idle" }
  | { kind: "loading"; tier: "default" | "premium" }
  | { kind: "error"; message: string };

export function ExampleExplanationPanel({
  explanation,
  status,
  onRegenerate,
  onRetry,
}: {
  explanation: ExampleExplanation | null;
  status: ExampleExplStatus;
  onRegenerate: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-900/50 dark:bg-sky-950/30">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-200">
          예문 해설
        </h3>
        {explanation && status.kind !== "loading" && (
          <button
            type="button"
            onClick={onRegenerate}
            aria-label="예문 해설 다시 생성"
            title="Sonnet으로 다시 생성"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-sky-300 bg-white text-sm text-sky-700 opacity-40 transition hover:opacity-100 dark:border-sky-800 dark:bg-neutral-900 dark:text-sky-300"
          >
            ✦
          </button>
        )}
      </div>

      {status.kind === "loading" && (
        <div className="flex items-center gap-2 text-sm text-sky-900 dark:text-sky-200">
          <Spinner className="h-4 w-4" />
          {status.tier === "premium"
            ? "고품질 예문 해설 생성 중…"
            : "예문 해설 생성 중…"}
        </div>
      )}

      {status.kind === "error" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-rose-600">
            예문 해설 생성 실패: {status.message}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-sm hover:border-sky-400"
          >
            다시 시도
          </button>
        </div>
      )}

      {status.kind === "idle" && explanation && (
        <div className="space-y-4 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
          <ExplSection label="늬앙스" body={explanation.nuance} />
          <ExplSection label="문법" body={explanation.grammar} />
          <ExplSection label="발음" body={explanation.pronunciation} />
          <ExplSection label="학습 포인트" body={explanation.takeaways} />
          <p className="pt-1 text-xs text-neutral-400">
            {explanation.modelUsed} ·{" "}
            {new Date(explanation.createdAt).toLocaleString("ko-KR")}
          </p>
        </div>
      )}
    </div>
  );
}

function ExplSection({ label, body }: { label: string; body: string }) {
  if (!body || body.trim() === "") return null;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
        {label}
      </div>
      <p className="whitespace-pre-wrap">{body}</p>
    </div>
  );
}
