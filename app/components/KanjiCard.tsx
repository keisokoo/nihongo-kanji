import { useState } from "react";
import { useRevalidator } from "react-router";
import { useTtsPlayer } from "~/lib/useTtsPlayer";
import type { Kanji, Reading } from "~/lib/db";
import { Spinner } from "./Spinner";
import { ConfirmModal } from "./ConfirmModal";

type Props = {
  kanji: Pick<Kanji, "id" | "character" | "level" | "meaningKo">;
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
    <article className="relative rounded-2xl border border-neutral-200 bg-white p-10 dark:border-neutral-800 dark:bg-neutral-900">
      <button
        type="button"
        disabled={refetch?.state === "loading"}
        onClick={() => setShowModal(true)}
        aria-label="음/훈독 재추출 (Kanjipedia)"
        title="Kanjipedia에서 음/훈독 다시 추출"
        className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 bg-white text-base text-neutral-600 opacity-30 transition hover:opacity-100 disabled:opacity-20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
      >
        {refetch?.state === "loading" ? (
          <Spinner className="h-4 w-4" />
        ) : (
          "↻"
        )}
      </button>

      <div className="flex items-start gap-10">
        <div className="text-[10rem] font-semibold leading-[0.9] text-neutral-900 dark:text-neutral-100 [font-family:'Noto_Sans_JP',sans-serif]">
          {kanji.character}
        </div>
        <div className="flex-1 pt-2">
          <div className="text-sm uppercase tracking-wide text-neutral-500">
            {kanji.level}
          </div>
          <div className="mt-2 text-lg text-neutral-700 dark:text-neutral-300">
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
              음/훈독 재추출 실패: {refetch.message}
            </p>
          )}
        </div>
      </div>

      <ConfirmModal
        open={showModal}
        title="음/훈독 다시 추출"
        body={
          <>
            <p>
              <strong>Kanjipedia</strong> 페이지에서{" "}
              <span className="[font-family:'Noto_Sans_JP',sans-serif]">
                {kanji.character}
              </span>{" "}
              의 음독/훈독을 다시 가져옵니다.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              기존 읽기 목록을 덮어씁니다 (단어와의 연결은 끊어질 수 있어요).
            </p>
          </>
        }
        confirmLabel="가져오기"
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
    <div className="mt-5 flex items-center gap-3">
      <span className="w-12 shrink-0 text-sm text-neutral-500">{label}</span>
      <div className="flex flex-wrap gap-2">
        {readings.map((r) => {
          const isLoading = loadingText === r.reading;
          return (
            <button
              key={r.id}
              type="button"
              disabled={loading}
              onClick={() => onPlay(r.reading)}
              className="inline-flex min-w-[4rem] items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-lg text-neutral-800 transition hover:border-neutral-400 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 [font-family:'Noto_Sans_JP',sans-serif]"
            >
              {isLoading ? <Spinner className="h-5 w-5" /> : r.reading}
            </button>
          );
        })}
      </div>
    </div>
  );
}
