import { useState } from "react";
import type {
  GrammarCategory,
  GrammarItem,
  GrammarItemDeepExplanation,
  GrammarUsageGuide,
} from "~/lib/idb/grammar-types";
import {
  addGrammarItemDeepExplanation,
  addGrammarUsageGuide,
} from "~/lib/idb/grammar-actions";
import { useAiAvailability } from "~/lib/idb/use-ai-availability";
import { ConfirmModal } from "~/components/ConfirmModal";
import { showUsageToast } from "~/components/Toast";
import { Spinner } from "~/components/Spinner";
import { FavoriteToggle } from "~/components/FavoriteToggle";
import {
  ExplanationCard,
  ExplSection,
  type ExplStatus,
} from "./ExplanationCard";
import { UsageGuidePanel } from "./UsageGuidePanel";

/**
 * 상단 카드 — 문법 패턴의 메타 정보.
 * 한자팩의 KanjiCard 자리.
 */
export function GrammarCard({ item }: { item: GrammarItem }) {
  const ai = useAiAvailability();
  const [explanation, setExplanation] =
    useState<GrammarItemDeepExplanation | null>(item.deepExplanation ?? null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ExplStatus>({ kind: "idle" });
  const [showRegenModal, setShowRegenModal] = useState(false);

  // 활용 가이드 상태
  const [guide, setGuide] = useState<GrammarUsageGuide | null>(
    item.usageGuide ?? null,
  );
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStatus, setGuideStatus] = useState<ExplStatus>({ kind: "idle" });
  const [showGuideRegenModal, setShowGuideRegenModal] = useState(false);

  async function fetchExplanation(tier: "default" | "premium") {
    setOpen(true);
    setStatus({ kind: "loading", tier });
    try {
      const data = await addGrammarItemDeepExplanation(item.id, tier);
      if (data.usage) showUsageToast("📖 문법 해설", data.usage);
      setExplanation(data.explanation);
      setStatus({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setStatus({ kind: "error", message });
    }
  }

  function toggle() {
    if (!explanation) fetchExplanation("default");
    else setOpen((v) => !v);
  }

  async function fetchGuide(tier: "default" | "premium") {
    setGuideOpen(true);
    setGuideStatus({ kind: "loading", tier });
    try {
      const data = await addGrammarUsageGuide(item.id, tier);
      if (data.usage) showUsageToast("🔧 활용 가이드", data.usage);
      setGuide(data.explanation);
      setGuideStatus({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setGuideStatus({ kind: "error", message });
    }
  }

  function toggleGuide() {
    if (!guide) fetchGuide("default");
    else setGuideOpen((v) => !v);
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col items-start justify-between gap-3">
        <div className="flex items-center gap-2 justify-between w-full">
          <div className="flex items-center justify-start gap-2">
            <CategoryBadge category={item.category} />
            <FavoriteToggle itemKind="grammar" itemId={item.id} />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={guideStatus.kind === "loading" || (!guide && !ai.hasAi)}
              onClick={toggleGuide}
              aria-pressed={guideOpen}
              aria-label="활용 가이드"
              title={
                !guide && !ai.hasAi
                  ? "AI 키 미설정"
                  : "AI 가 패턴을 그룹·용법·비교 등 sections 으로 정리"
              }
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-base transition disabled:opacity-50 ${
                guideOpen
                  ? "border-indigo-400 bg-indigo-50 text-indigo-900 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-200"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {guideStatus.kind === "loading" ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <span aria-hidden>🔧</span>
              )}
            </button>
            <button
              type="button"
              disabled={
                status.kind === "loading" || (!explanation && !ai.hasAi)
              }
              onClick={toggle}
              aria-pressed={open}
              aria-label="문법 해설"
              title={
                !explanation && !ai.hasAi
                  ? "AI 키 미설정"
                  : "AI 가 문법 패턴을 더 깊게 설명 (언제 쓰는지 / 비교 / 자주 틀리는 점 / 학습 포인트)"
              }
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-base transition disabled:opacity-50 ${
                open
                  ? "border-sky-400 bg-sky-50 text-sky-900 dark:border-sky-500 dark:bg-sky-950 dark:text-sky-200"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {status.kind === "loading" ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <span aria-hidden>📖</span>
              )}
            </button>
          </div>
        </div>
        <div className="min-w-0">
          {item.romaji && (
            <p className="mt-1 truncate text-sm text-neutral-500 dark:text-neutral-400">
              {item.romaji}
            </p>
          )}
          <h1 className="text-3xl font-semibold text-neutral-900 [font-family:'Noto_Sans_JP',sans-serif] sm:text-4xl dark:text-neutral-100">
            {item.pattern}
          </h1>
          <p className="mt-2 text-base text-neutral-700 sm:text-lg dark:text-neutral-300">
            {item.meaningsKo.join(" · ")}
          </p>
          {item.refOriginalEn && (
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              EN: {item.refOriginalEn}
            </p>
          )}
        </div>
      </div>

      {item.formation && (
        <div className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            형태{" "}
          </span>
          <span className="ml-1">{item.formation}</span>
        </div>
      )}

      <div className="mt-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          설명
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-800 sm:text-base dark:text-neutral-200">
          {item.explanation}
        </p>
      </div>

      {item.notes && (
        <div className="mt-5 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-medium">주의 </span>
          {item.notes}
        </div>
      )}

      {guideOpen && (
        <UsageGuidePanel
          guide={guide}
          status={guideStatus}
          hasGuide={!!guide}
          onRegenerate={() => setShowGuideRegenModal(true)}
          onRetry={() => fetchGuide("default")}
        />
      )}

      {open && (
        <ExplanationCard
          title="문법 해설"
          status={status}
          hasExplanation={!!explanation}
          onRegenerate={() => setShowRegenModal(true)}
          onRetry={() => fetchExplanation("default")}
          modelUsed={explanation?.modelUsed}
          createdAt={explanation?.createdAt}
        >
          {explanation && (
            <>
              <ExplSection label="언제 쓰는가" body={explanation.whenToUse} />
              <ExplSection label="비교" body={explanation.comparison} />
              <ExplSection
                label="자주 틀리는 점"
                body={explanation.commonMistakes}
              />
              <ExplSection label="학습 포인트" body={explanation.takeaways} />
            </>
          )}
        </ExplanationCard>
      )}

      <ConfirmModal
        open={showRegenModal}
        title="문법 해설 다시 생성"
        body={
          <>
            <p>
              <strong>Sonnet</strong> 으로 문법 해설을 다시 생성합니다.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              기존 해설을 덮어씁니다. 비용이 더 발생합니다.
            </p>
          </>
        }
        confirmLabel="생성"
        onConfirm={() => {
          setShowRegenModal(false);
          fetchExplanation("premium");
        }}
        onCancel={() => setShowRegenModal(false)}
      />

      <ConfirmModal
        open={showGuideRegenModal}
        title="활용 가이드 다시 생성"
        body={
          <>
            <p>
              <strong>Sonnet</strong> 으로 활용 가이드를 다시 생성합니다.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              기존 가이드를 덮어씁니다. 비용이 더 발생합니다.
            </p>
          </>
        }
        confirmLabel="생성"
        onConfirm={() => {
          setShowGuideRegenModal(false);
          fetchGuide("premium");
        }}
        onCancel={() => setShowGuideRegenModal(false)}
      />
    </div>
  );
}

const CATEGORY_LABELS: Record<GrammarCategory, string> = {
  verb_form: "동사 활용",
  particle: "조사",
  expression: "표현",
  conjunction: "접속",
  auxiliary: "조동사",
  honorific: "경어",
  ending: "종조사",
  other: "기타",
};

function CategoryBadge({ category }: { category: GrammarCategory }) {
  return (
    <span className="shrink-0 rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
      {CATEGORY_LABELS[category]}
    </span>
  );
}
