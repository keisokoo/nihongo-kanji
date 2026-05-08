import { useState } from "react";
import { useRevalidator } from "react-router";
import { useTtsPlayer } from "~/lib/useTtsPlayer";
import type { Kanji, Reading } from "~/lib/db";
import { Spinner } from "./Spinner";
import { ConfirmModal } from "./ConfirmModal";
import { showUsageToast, type ApiUsage } from "./Toast";

type Props = {
  kanji: Pick<Kanji, "id" | "character" | "packKey" | "meaningKo">;
  readings: Reading[];
};

export function KanjiCard({ kanji, readings }: Props) {
  const { play, loading, loadingText, error } = useTtsPlayer();
  const revalidator = useRevalidator();

  const [refetch, setRefetch] = useState<
    null | { state: "loading" } | { state: "error"; message: string }
  >(null);
  const [showModal, setShowModal] = useState(false);

  async function refetchReadings() {
    setShowModal(false);
    setRefetch({ state: "loading" });
    try {
      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanjiId: kanji.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      const body = (await res.json().catch(() => ({}))) as {
        usage?: ApiUsage | null;
      };
      if (body.usage) showUsageToast("↻ 한자 의미 재생성", body.usage);
      // Re-run loader to pick up the new readings.
      revalidator.revalidate();
      setRefetch(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setRefetch({ state: "error", message });
    }
  }

  const onyomi = readings.filter((r) => r.type === "on");
  const kunyomi = readings.filter((r) => r.type === "kun");

  return (
    <article className="relative rounded-2xl border border-neutral-200 bg-white p-5 sm:p-10 dark:border-neutral-800 dark:bg-neutral-900">
      <button
        type="button"
        disabled={refetch?.state === "loading"}
        onClick={() => setShowModal(true)}
        aria-label="음/훈독 + 의미 다시 생성"
        title="Kanjipedia에서 음/훈독 재추출 + Haiku로 한국어 의미 재생성"
        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 bg-white text-base text-neutral-600 opacity-30 transition hover:opacity-100 disabled:opacity-20 sm:right-4 sm:top-4 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
      >
        {refetch?.state === "loading" ? (
          <Spinner className="h-4 w-4" />
        ) : (
          "↻"
        )}
      </button>

      <div className="flex items-start gap-4 sm:gap-10">
        <div className="text-[5rem] font-semibold leading-[0.9] text-neutral-900 sm:text-[8rem] md:text-[10rem] dark:text-neutral-100 [font-family:'Noto_Sans_JP',sans-serif]">
          {kanji.character}
        </div>
        <div className="flex-1 pt-1 sm:pt-2">
          <div className="text-xs uppercase tracking-wide text-neutral-500 sm:text-sm">
            {kanji.packKey}
          </div>
          <div className="mt-1.5 text-base text-neutral-700 sm:mt-2 sm:text-lg dark:text-neutral-300">
            {kanji.meaningKo}
          </div>

          <ReadingRow
            label="음독"
            readings={onyomi}
            onPlay={play}
            loading={loading}
            loadingText={loadingText}
          />
          <ReadingRow
            label="훈독"
            readings={kunyomi}
            onPlay={play}
            loading={loading}
            loadingText={loadingText}
          />

          {error && (
            <p className="mt-4 text-sm text-rose-600">
              발음 재생 실패: {error}
            </p>
          )}
          {refetch?.state === "error" && (
            <p className="mt-4 text-sm text-rose-600">
              재추출 실패: {refetch.message}
            </p>
          )}
        </div>
      </div>

      <ConfirmModal
        open={showModal}
        title="음/훈독 + 의미 다시 생성"
        body={
          <>
            <p>
              <strong>Kanjipedia</strong> 에서{" "}
              <span className="[font-family:'Noto_Sans_JP',sans-serif]">
                {kanji.character}
              </span>{" "}
              의 음독/훈독을 재추출하고, <strong>Haiku</strong> 로 한국어 의미를
              다시 생성합니다.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              기존 읽기 목록과 의미를 덮어씁니다 (단어와의 연결은 끊어질 수
              있어요).
            </p>
          </>
        }
        confirmLabel="다시 생성"
        onConfirm={refetchReadings}
        onCancel={() => setShowModal(false)}
      />
    </article>
  );
}

function ReadingRow({
  label,
  readings,
  onPlay,
  loading,
  loadingText,
}: {
  label: string;
  readings: Reading[];
  onPlay: (text: string) => void;
  loading: boolean;
  loadingText: string | null;
}) {
  if (readings.length === 0) return null;
  return (
    <div className="mt-4 flex items-start gap-2 sm:mt-5 sm:items-center sm:gap-3">
      <span className="w-10 shrink-0 pt-2 text-xs text-neutral-500 sm:w-12 sm:pt-0 sm:text-sm">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {readings.map((r) => {
          const isLoading = loadingText === r.reading;
          return (
            <button
              key={r.id}
              type="button"
              disabled={loading}
              onClick={() => onPlay(r.reading)}
              className="inline-flex min-w-[3rem] items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-base text-neutral-800 transition hover:border-neutral-400 hover:bg-neutral-100 disabled:opacity-50 sm:min-w-[4rem] sm:px-4 sm:py-2 sm:text-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 [font-family:'Noto_Sans_JP',sans-serif]"
            >
              {isLoading ? <Spinner className="h-5 w-5" /> : r.reading}
            </button>
          );
        })}
      </div>
    </div>
  );
}
