import { useMemo } from "react";
import type { GrammarUsageGuide } from "~/lib/idb/grammar-types";
import { parseSentence } from "~/lib/sentence";
import { GrammarSentence } from "./GrammarSentence";
import { Spinner } from "~/components/Spinner";
import type { ExplStatus } from "./ExplanationCard";

/**
 * 활용 가이드 패널 — sections 단위로 정리된 카드.
 * deepExplanation 과 시각적으로 구분 (sky → indigo) 위해 별도 색상.
 */
export function UsageGuidePanel({
  guide,
  status,
  hasGuide,
  onRegenerate,
  onRetry,
}: {
  guide: GrammarUsageGuide | null;
  status: ExplStatus;
  hasGuide: boolean;
  onRegenerate: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 sm:p-5 dark:border-indigo-900/50 dark:bg-indigo-950/30">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">
          활용 가이드
        </h3>
        {hasGuide && status.kind !== "loading" && (
          <button
            type="button"
            onClick={onRegenerate}
            aria-label="활용 가이드 다시 생성"
            title="Sonnet으로 다시 생성"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-indigo-300 bg-white text-sm text-indigo-700 opacity-40 transition hover:opacity-100 dark:border-indigo-800 dark:bg-neutral-900 dark:text-indigo-300"
          >
            ✦
          </button>
        )}
      </div>

      {status.kind === "loading" && (
        <div className="flex items-center gap-2 text-sm text-indigo-900 dark:text-indigo-200">
          <Spinner className="h-4 w-4" />
          {status.tier === "premium"
            ? "고품질 활용 가이드 생성 중…"
            : "활용 가이드 생성 중…"}
        </div>
      )}

      {status.kind === "error" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-rose-600">
            활용 가이드 실패: {status.message}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-sm hover:border-indigo-400"
          >
            다시 시도
          </button>
        </div>
      )}

      {status.kind === "idle" && guide && (
        <div className="space-y-4 text-sm text-neutral-800 dark:text-neutral-200">
          {guide.intro && (
            <p className="text-sm leading-relaxed">{guide.intro}</p>
          )}
          {guide.sections.map((s, i) => (
            <SectionBlock key={i} section={s} />
          ))}
          <p className="pt-1 text-xs text-neutral-400">
            {guide.modelUsed} ·{" "}
            {new Date(guide.createdAt).toLocaleString("ko-KR")}
          </p>
        </div>
      )}
    </div>
  );
}

function SectionBlock({
  section,
}: {
  section: GrammarUsageGuide["sections"][number];
}) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-white p-3 dark:border-indigo-900/50 dark:bg-neutral-900">
      <div className="mb-1 text-sm font-semibold text-indigo-900 dark:text-indigo-200">
        {section.title}
      </div>
      <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        {section.rule}
      </p>
      {section.examples.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {section.examples.map((ex, i) => (
            <ExampleRow key={i} ex={ex} />
          ))}
        </ul>
      )}
      {section.note && (
        <p className="mt-2 rounded bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {section.note}
        </p>
      )}
    </div>
  );
}

function ExampleRow({
  ex,
}: {
  ex: GrammarUsageGuide["sections"][number]["examples"][number];
}) {
  // jp 가 inline-markup 일 수 있음 — parseSentence 로 시도, 실패 시 raw 표시.
  const tokens = useMemo(() => {
    try {
      return parseSentence(ex.jp, "usage-guide ex");
    } catch {
      return null;
    }
  }, [ex.jp]);

  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="[font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
        {tokens ? <GrammarSentence tokens={tokens} /> : ex.jp}
      </span>
      {ex.jpReading && (
        <span className="text-xs text-neutral-500 [font-family:'Noto_Sans_JP',sans-serif]">
          ({ex.jpReading})
        </span>
      )}
      {ex.conjugated && (
        <>
          <span className="text-neutral-400">→</span>
          <span className="[font-family:'Noto_Sans_JP',sans-serif] font-semibold text-indigo-700 dark:text-indigo-300">
            {ex.conjugated}
          </span>
        </>
      )}
      <span className="text-neutral-500 dark:text-neutral-400">
        — {ex.gloss}
      </span>
    </li>
  );
}
