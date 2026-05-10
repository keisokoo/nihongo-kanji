import type { ReactNode } from "react";

/**
 * 퀴즈 카드 공통 껍데기.
 * - 상단에 step / type 라벨 + 정답/오답 상태
 * - prompt 영역
 * - choices 영역 (자식이 알아서 그려줌)
 * - 정답 공개 후 추가 정보 (footer)
 */
export function QuizShell({
  step,
  label,
  picked,
  isCorrect,
  prompt,
  choices,
  footer,
  ttsButton,
  explanationButton,
  explanationPanel,
}: {
  step: string;
  label: string;
  picked: boolean;
  isCorrect: boolean | null;
  prompt: ReactNode;
  choices: ReactNode;
  footer?: ReactNode;
  /** 헤더 우측의 TTS (♪) 버튼 — 일본어 prompt 가 있을 때만. */
  ttsButton?: ReactNode;
  /** 헤더 우측에 배치되는 해설 토글 버튼. */
  explanationButton?: ReactNode;
  /** choices 아래에 렌더되는 해설 패널 (열려있을 때). */
  explanationPanel?: ReactNode;
}) {
  const active = !picked;
  return (
    <div
      className={`rounded-xl border p-4 transition sm:p-5 ${
        active
          ? "border-sky-300 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/20"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">
            {step}
          </span>
          <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isCorrect === true && (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              ✓ 정답
            </span>
          )}
          {isCorrect === false && (
            <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
              ✗ 틀림
            </span>
          )}
          {ttsButton}
          {explanationButton}
        </div>
      </div>
      <div className="mb-4">{prompt}</div>
      {choices}
      {footer && (
        <div className="mt-4 border-t border-neutral-200 pt-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          {footer}
        </div>
      )}
      {explanationPanel}
    </div>
  );
}

/** 4지선다 그리드. 자식 별로 ChoiceButton 을 직접 컴포지션해서 사용. */
export function ChoiceGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">{children}</div>
  );
}

export function ChoiceButton({
  picked,
  pickedKey,
  myKey,
  isCorrect,
  onPick,
  japanese,
  children,
}: {
  /** 누구라도 picked 됐는지 (전체 disable 용) */
  picked: boolean;
  /** picked 됐을 때 자기 자신이 picked 였는지 */
  pickedKey?: string | null;
  /** 자기 자신의 식별자 */
  myKey: string;
  /** 자기 자신이 정답인지 */
  isCorrect: boolean;
  onPick: () => void;
  japanese?: boolean;
  children: ReactNode;
}) {
  const isMePicked = pickedKey === myKey;
  let stateClass: string;
  if (!picked) {
    stateClass =
      "border-neutral-200 bg-white hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900";
  } else if (isCorrect) {
    stateClass =
      "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
  } else if (isMePicked) {
    stateClass =
      "border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100";
  } else {
    stateClass =
      "border-neutral-200 bg-white opacity-50 dark:border-neutral-800 dark:bg-neutral-900";
  }
  return (
    <button
      type="button"
      disabled={picked}
      onClick={onPick}
      className={`rounded-xl border px-4 py-3 text-left text-base transition sm:px-5 sm:py-3.5 sm:text-lg ${
        japanese ? "[font-family:'Noto_Sans_JP',sans-serif]" : ""
      } ${stateClass}`}
    >
      {children}
    </button>
  );
}
