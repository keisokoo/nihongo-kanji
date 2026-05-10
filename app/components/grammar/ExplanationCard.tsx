import type { ReactNode } from "react";
import { Spinner } from "~/components/Spinner";

export type ExplStatus =
  | { kind: "idle" }
  | { kind: "loading"; tier: "default" | "premium" }
  | { kind: "error"; message: string };

/**
 * 공통 해설 패널 wrapper — loading / error / 재생성 처리.
 * 본문 (구체적 필드) 은 children 으로 그려줌.
 */
export function ExplanationCard({
  title,
  status,
  hasExplanation,
  onRegenerate,
  onRetry,
  modelUsed,
  createdAt,
  children,
}: {
  title: string;
  status: ExplStatus;
  hasExplanation: boolean;
  onRegenerate: () => void;
  onRetry: () => void;
  modelUsed?: string;
  createdAt?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:p-5 dark:border-sky-900/50 dark:bg-sky-950/30">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-200">
          {title}
        </h3>
        {hasExplanation && status.kind !== "loading" && (
          <button
            type="button"
            onClick={onRegenerate}
            aria-label={`${title} 다시 생성`}
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
            ? `고품질 ${title} 생성 중…`
            : `${title} 생성 중…`}
        </div>
      )}

      {status.kind === "error" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-rose-600">
            {title} 실패: {status.message}
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

      {status.kind === "idle" && hasExplanation && (
        <div className="space-y-3.5 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
          {children}
          {(modelUsed || createdAt) && (
            <p className="pt-1 text-xs text-neutral-400">
              {modelUsed}
              {modelUsed && createdAt && " · "}
              {createdAt && new Date(createdAt).toLocaleString("ko-KR")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ExplSection({ label, body }: { label: string; body: string }) {
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
