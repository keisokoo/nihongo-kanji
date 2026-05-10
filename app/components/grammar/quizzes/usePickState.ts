import { useState } from "react";

/**
 * Quiz pick 상태. controlled 모드 (테스트) / uncontrolled 모드 (학습) 양쪽 지원.
 *
 * - 학습 모드 (props.controlled === undefined): 내부 useState 사용. 페이지 머무는 동안만 유지.
 * - 시험 모드 (props.controlled 제공): picked 는 외부에서 주입, onPick 으로 외부 저장.
 */
export function usePickState(
  controlled?: {
    picked: string | null;
    onPick: (choice: string) => void;
  },
) {
  const [internal, setInternal] = useState<string | null>(null);
  const picked = controlled ? controlled.picked : internal;
  const setPicked = (choice: string) => {
    if (controlled) controlled.onPick(choice);
    else setInternal(choice);
  };
  return [picked, setPicked] as const;
}

export type ControlledPick = {
  picked: string | null;
  onPick: (choice: string) => void;
};
