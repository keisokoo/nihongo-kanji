import { useTtsPlayer } from "~/lib/useTtsPlayer";
import type { Kanji, Reading } from "~/lib/db";

type Props = {
  kanji: Pick<Kanji, "id" | "character" | "level" | "meaningKo">;
  readings: Reading[];
};

export function KanjiCard({ kanji, readings }: Props) {
  const { play, loading } = useTtsPlayer();

  const onyomi = readings.filter((r) => r.type === "on");
  const kunyomi = readings.filter((r) => r.type === "kun");

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-6">
        <div className="text-6xl font-semibold leading-none text-neutral-900 dark:text-neutral-100 [font-family:'Noto_Sans_JP',sans-serif]">
          {kanji.character}
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            {kanji.level}
          </div>
          <div className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
            {kanji.meaningKo}
          </div>

          <ReadingRow label="음독" readings={onyomi} onPlay={play} loading={loading} />
          <ReadingRow label="훈독" readings={kunyomi} onPlay={play} loading={loading} />
        </div>
      </div>
    </article>
  );
}

function ReadingRow({
  label,
  readings,
  onPlay,
  loading,
}: {
  label: string;
  readings: Reading[];
  onPlay: (text: string) => void;
  loading: boolean;
}) {
  if (readings.length === 0) return null;
  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="w-10 shrink-0 text-xs text-neutral-500">{label}</span>
      <div className="flex flex-wrap gap-2">
        {readings.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={loading}
            onClick={() => onPlay(r.reading)}
            className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm text-neutral-800 transition hover:border-neutral-400 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 [font-family:'Noto_Sans_JP',sans-serif]"
          >
            {r.reading}
          </button>
        ))}
      </div>
    </div>
  );
}
