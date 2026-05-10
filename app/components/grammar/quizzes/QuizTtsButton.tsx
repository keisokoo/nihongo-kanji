import { useTtsPlayer } from "~/lib/useTtsPlayer";
import { useAiAvailability } from "~/lib/idb/use-ai-availability";
import { Spinner } from "~/components/Spinner";

/**
 * 퀴즈 헤더의 ♪ TTS 버튼.
 * `text` 가 비어있거나 `disabled` 면 버튼이 disable 됨.
 */
export function QuizTtsButton({
  text,
  disabled,
  reason,
}: {
  /** 재생할 일본어. 빈 문자열이면 비활성. */
  text: string;
  disabled?: boolean;
  /** disabled 일 때 tooltip 메시지. */
  reason?: string;
}) {
  const { play, loading, loadingText } = useTtsPlayer();
  const ai = useAiAvailability();
  const noKey = !ai.hasTts;
  const isDisabled = !text || !!disabled || loading || noKey;
  const isMine = loadingText === text;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => play(text)}
      aria-label="발음 듣기"
      title={
        noKey
          ? "Gemini API 키 미설정 — TTS 사용 불가"
          : disabled
            ? (reason ?? "지금은 재생 불가")
            : "발음 듣기"
      }
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-neutral-300 text-sm text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      {isMine ? <Spinner className="h-3.5 w-3.5" /> : "♪"}
    </button>
  );
}
