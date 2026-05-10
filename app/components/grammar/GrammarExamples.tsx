import { useMemo, useState } from "react";
import type {
  GrammarExample,
  GrammarExampleExplanation,
} from "~/lib/idb/grammar-types";
import { parseSentence, tokensToPlain } from "~/lib/sentence";
import { Spinner } from "~/components/Spinner";
import { useTtsPlayer } from "~/lib/useTtsPlayer";
import { addGrammarExampleExplanation } from "~/lib/idb/grammar-actions";
import { useAiAvailability } from "~/lib/idb/use-ai-availability";
import { ConfirmModal } from "~/components/ConfirmModal";
import { showUsageToast } from "~/components/Toast";
import { GrammarSentence } from "./GrammarSentence";
import { ExplanationCard, ExplSection, type ExplStatus } from "./ExplanationCard";

export function GrammarExamples({
  itemId,
  examples,
  pattern,
}: {
  itemId: number;
  examples: GrammarExample[];
  pattern: string;
}) {
  if (examples.length === 0) return null;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        예문
      </h2>
      <ol className="space-y-4">
        {examples.map((ex, i) => (
          <ExampleRow
            key={i}
            itemId={itemId}
            exampleIndex={i}
            ex={ex}
            pattern={pattern}
            index={i + 1}
          />
        ))}
      </ol>
    </div>
  );
}

function ExampleRow({
  itemId,
  exampleIndex,
  ex,
  pattern,
  index,
}: {
  itemId: number;
  exampleIndex: number;
  ex: GrammarExample;
  pattern: string;
  index: number;
}) {
  const tokens = useMemo(
    () => parseSentence(ex.sentence, `${pattern}/example[${index}]`),
    [ex.sentence, pattern, index],
  );
  const plain = useMemo(() => tokensToPlain(tokens), [tokens]);
  const { play, loading: ttsLoading, loadingText } = useTtsPlayer();
  const ttsForThis = loadingText === plain;

  const ai = useAiAvailability();
  const [explanation, setExplanation] = useState<GrammarExampleExplanation | null>(
    ex.explanation ?? null,
  );
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ExplStatus>({ kind: "idle" });
  const [showRegenModal, setShowRegenModal] = useState(false);

  async function fetchExplanation(tier: "default" | "premium") {
    setOpen(true);
    setStatus({ kind: "loading", tier });
    try {
      const data = await addGrammarExampleExplanation(
        itemId,
        exampleIndex,
        tier,
      );
      if (data.usage) showUsageToast("📖 예문 해설", data.usage);
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

  return (
    <li className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-start justify-between gap-3">
        <p className="flex-1 text-base leading-loose text-neutral-900 sm:text-lg [font-family:'Noto_Sans_JP',sans-serif] dark:text-neutral-100">
          <GrammarSentence tokens={tokens} />
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={ttsLoading}
            onClick={() => play(plain)}
            aria-label="발음 듣기"
            title="발음 듣기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-base text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {ttsForThis ? <Spinner className="h-4 w-4" /> : "♪"}
          </button>
          <button
            type="button"
            disabled={status.kind === "loading" || (!explanation && !ai.hasAi)}
            onClick={toggle}
            aria-pressed={open}
            aria-label="예문 해설"
            title={
              !explanation && !ai.hasAi
                ? "AI 키 미설정"
                : "예문 해설 (늬앙스/문법/발음/학습 포인트)"
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
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        {ex.sentenceTranslationKo}
      </p>
      {ex.note && (
        <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
          → {ex.note}
        </p>
      )}

      {open && (
        <ExplanationCard
          title="예문 해설"
          status={status}
          hasExplanation={!!explanation}
          onRegenerate={() => setShowRegenModal(true)}
          onRetry={() => fetchExplanation("default")}
          modelUsed={explanation?.modelUsed}
          createdAt={explanation?.createdAt}
        >
          {explanation && (
            <>
              <ExplSection label="늬앙스" body={explanation.nuance} />
              <ExplSection label="문법" body={explanation.grammar} />
              <ExplSection label="발음" body={explanation.pronunciation} />
              <ExplSection label="학습 포인트" body={explanation.takeaways} />
            </>
          )}
        </ExplanationCard>
      )}

      <ConfirmModal
        open={showRegenModal}
        title="예문 해설 다시 생성"
        body={
          <>
            <p>
              <strong>Sonnet</strong> 으로 예문 해설을 다시 생성합니다.
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
    </li>
  );
}
