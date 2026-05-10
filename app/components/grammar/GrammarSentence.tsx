import type { SentenceToken } from "~/lib/idb/types";

/**
 * Grammar 문장 렌더링.
 *
 * 한자팩의 SentenceRender 와 차이점:
 * - target 의 reading 이 따로 없음 (target = 문법 형태 자체)
 * - target 은 항상 보이는 상태 (학습 중 가려둘 필요 없음)
 * - target 강조는 underline + 색상 (혼란 안 주는 선에서)
 *
 * blank 모드: 빈칸 quiz 에서 target 자리를 ⬜ 로 치환해서 보여주려면
 * `blankPlaceholder` 를 지정 (true 면 텍스트 대신 빈칸 박스 렌더).
 */
export function GrammarSentence({
  tokens,
  blankPlaceholder = false,
  revealAnswer = false,
  highlightClass = "font-semibold text-sky-700 dark:text-sky-300",
}: {
  tokens: SentenceToken[];
  /** quiz 의 blank 슬롯에서 target 자리를 빈 박스로 표시. */
  blankPlaceholder?: boolean;
  /** blank quiz 에서 정답 공개 후엔 target 텍스트 그대로 보여줌. */
  revealAnswer?: boolean;
  highlightClass?: string;
}) {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.target) {
          if (blankPlaceholder && !revealAnswer) {
            return (
              <span
                key={i}
                className="mx-0.5 inline-block min-w-[2.4em] rounded border-2 border-dashed border-sky-400 bg-sky-50 px-2 py-0.5 align-baseline text-center text-sky-500 dark:border-sky-600 dark:bg-sky-950/40 dark:text-sky-400"
                aria-label="빈칸"
              >
                ?
              </span>
            );
          }
          return (
            <span key={i} className={highlightClass}>
              {t.text}
            </span>
          );
        }
        if (t.reading) {
          return (
            <ruby key={i}>
              {t.text}
              <rt className="text-[0.55em] font-normal text-neutral-500">
                {t.reading}
              </rt>
            </ruby>
          );
        }
        return <span key={i}>{t.text}</span>;
      })}
    </>
  );
}
