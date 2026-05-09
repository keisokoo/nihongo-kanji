import type { SentenceToken } from "~/lib/db";

/**
 * Render an annotated Japanese sentence:
 * - target word: emphasized; reading hidden until `revealTarget` is true.
 * - other kanji: shown with hiragana ruby above.
 * - plain text: passed through.
 */
export function SentenceRender({
  tokens,
  revealTarget,
  wordReading,
}: {
  tokens: SentenceToken[];
  revealTarget: boolean;
  wordReading: string;
}) {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.target) {
          if (revealTarget) {
            return (
              <ruby
                key={i}
                className="font-semibold text-neutral-900 dark:text-neutral-100"
              >
                {t.text}
                <rt className="text-[0.55em] font-normal text-emerald-600">
                  {wordReading}
                </rt>
              </ruby>
            );
          }
          return (
            <span
              key={i}
              className="font-semibold text-neutral-900 underline decoration-dotted underline-offset-4 dark:text-neutral-100"
            >
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
