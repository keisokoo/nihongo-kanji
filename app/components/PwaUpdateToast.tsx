import { useEffect, useState } from "react";

/**
 * 새 SW (= 새 앱 버전) 가 대기 중이면 우상단 배너 표시.
 * 사용자가 "적용" 누르면 SKIP_WAITING 메시지 + reload.
 *
 * iOS 홈 앱에서도 동일하게 동작 — controller 가 바뀌면 reload 가 일어남.
 */
export function PwaUpdateToast() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;

    function attachToWorker(sw: ServiceWorker | null) {
      if (!sw) return;
      sw.addEventListener("statechange", () => {
        // 새 SW 가 install 끝났고 기존 SW 가 control 중이면 = 업데이트 대기
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          if (!cancelled) setWaiting(sw);
        }
      });
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        // 이미 waiting 인 SW 가 있으면 즉시 반영 (예: 재진입 시)
        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaiting(reg.waiting);
        }
        // installing → installed 추적
        attachToWorker(reg.installing);
        reg.addEventListener("updatefound", () => {
          attachToWorker(reg.installing);
        });
      })
      .catch((err) => {
        console.warn("[sw] register failed:", err);
      });

    // 새 SW 가 control 잡으면 자동 reload — 사용자가 적용 눌렀을 때 발생
    let reloading = false;
    function onControllerChange() {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      // unmount 시 registration 해제 안 함 (앱 lifecycle 내내 유지)
      void registration;
    };
  }, []);

  function applyUpdate() {
    if (!waiting) return;
    waiting.postMessage({ type: "SKIP_WAITING" });
    // controllerchange 가 발생하면 위 핸들러가 reload
  }

  function dismiss() {
    setWaiting(null);
  }

  if (!waiting) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4 sm:bottom-6">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-sky-300 bg-white px-4 py-3 shadow-lg dark:border-sky-700 dark:bg-neutral-900">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            새 버전 사용 가능
          </div>
          <div className="text-xs text-neutral-500">
            적용하면 앱이 새로고침 됩니다.
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          나중에
        </button>
        <button
          type="button"
          onClick={applyUpdate}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
        >
          적용
        </button>
      </div>
    </div>
  );
}
