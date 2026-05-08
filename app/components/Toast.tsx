import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export type ApiUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

type ToastItem = {
  id: string;
  content: ReactNode;
};

type Listener = (items: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l(toasts);
}

export function showToast(content: ReactNode, durationMs = 5000) {
  if (typeof window === "undefined") return;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  toasts = [...toasts, { id, content }];
  notify();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, durationMs);
}

export function showUsageToast(label: string, usage: ApiUsage) {
  const cache =
    usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
  const modelShort = usage.model.replace(/^claude-/, "");
  const total = usage.inputTokens + usage.outputTokens + cache;
  showToast(
    <div className="min-w-[16rem]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </span>
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {modelShort}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
        <span>입력 {usage.inputTokens.toLocaleString()}</span>
        <span>출력 {usage.outputTokens.toLocaleString()}</span>
        {cache > 0 && <span>캐시 {cache.toLocaleString()}</span>}
        <span className="text-neutral-400">합계 {total.toLocaleString()}</span>
      </div>
    </div>,
  );
}

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(toasts);
  useEffect(() => {
    listeners.add(setList);
    setList(toasts);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-fit flex-col gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
