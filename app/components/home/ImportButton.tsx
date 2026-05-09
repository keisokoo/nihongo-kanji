import { useRef, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";
import { Spinner } from "~/components/Spinner";
import type { Pack } from "~/lib/db";

type Status =
  | { kind: "idle" }
  | { kind: "loading"; filename: string }
  | { kind: "error"; message: string }
  | { kind: "delta-pending"; filename: string; body: DeltaBody };

// Lightweight shape — full type lives on the server.
type DeltaBody = {
  kind: "jlpt-delta";
  key: string;
  title: string;
  items: Array<{ kanjiCharacter: string; words: unknown[] }>;
};

type DeltaResult = {
  packKey: string;
  mode: "replace" | "merge";
  insertedWords: number;
  insertedExamples: number;
  attachedWordExplanations: number;
  attachedExampleExplanations: number;
  skippedWords: number;
  unknownKanji: string[];
  warnings: string[];
};

export function ImportButton() {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onFile(file: File) {
    setStatus({ kind: "loading", filename: file.name });
    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (json?.kind === "jlpt-delta") {
        // Stop here and let the user choose replace vs merge.
        setStatus({ kind: "delta-pending", filename: file.name, body: json });
        return;
      }

      // Anything else: treat as full pack (custom-full export OR raw seed JSON).
      await runImport(json, file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : "import failed";
      setStatus({ kind: "error", message });
    }
  }

  async function runImport(payload: unknown, filename: string) {
    setStatus({ kind: "loading", filename });
    const res = await fetch("/api/pack/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `request failed (${res.status})`);
    }
    const data = (await res.json()) as
      | { kind: "custom"; pack: Pack }
      | { kind: "jlpt-delta"; result: DeltaResult };
    setStatus({ kind: "idle" });

    if (data.kind === "custom") {
      navigate(`/study/${encodeURIComponent(data.pack.key)}`);
      return;
    }
    // jlpt-delta — stay on home, refresh the loader to update counts/cards.
    revalidator.revalidate();
    const r = data.result;
    const summary =
      `${r.packKey} ${r.mode === "replace" ? "교체" : "병합"} 완료 — ` +
      `+${r.insertedWords} 단어 / +${r.insertedExamples} 예문` +
      (r.skippedWords > 0 ? ` · 중복 ${r.skippedWords} 건 스킵` : "") +
      (r.unknownKanji.length > 0
        ? ` · 알 수 없는 한자 ${r.unknownKanji.length} 건`
        : "");
    // Use a quick alert so the user knows it worked. Toast system is for AI cost only.
    if (typeof window !== "undefined") window.alert(summary);
  }

  async function applyDelta(mode: "replace" | "merge") {
    if (status.kind !== "delta-pending") return;
    const { body, filename } = status;
    try {
      await runImport({ ...body, mode }, filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : "import failed";
      setStatus({ kind: "error", message });
    }
  }

  function cancelDelta() {
    if (status.kind === "delta-pending") setStatus({ kind: "idle" });
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {status.kind === "error" && (
          <span className="text-xs text-rose-600">{status.message}</span>
        )}
        {status.kind === "loading" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
            <Spinner className="h-3.5 w-3.5" />
            {status.filename}
          </span>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={status.kind === "loading"}
          onClick={() => fileInput.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
        >
          + JSON 가져오기
        </button>
      </div>

      {status.kind === "delta-pending" && (
        <DeltaModeModal
          body={status.body}
          onPick={applyDelta}
          onCancel={cancelDelta}
        />
      )}
    </>
  );
}

function DeltaModeModal({
  body,
  onPick,
  onCancel,
}: {
  body: DeltaBody;
  onPick: (mode: "replace" | "merge") => void;
  onCancel: () => void;
}) {
  const wordCount = body.items.reduce((n, it) => n + it.words.length, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-neutral-900/40" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {body.title || body.key} 추가 데이터 가져오기
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          AI 생성 데이터 {wordCount}개 단어가 포함된 delta 파일이에요.
          이 팩에 이미 만들어 둔 AI 데이터(단어/예문/해설)가 있을 수
          있습니다. 어떻게 적용할까요?
        </p>

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={() => onPick("merge")}
            className="block w-full rounded-lg border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
          >
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              병합 (Merge)
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              기존 AI 데이터는 유지하고, 가져오기 파일에서 중복되지 않는
              항목만 추가합니다. 안전하지만 기존과 다른 동일 단어가 있으면
              스킵됩니다.
            </div>
          </button>
          <button
            type="button"
            onClick={() => onPick("replace")}
            className="block w-full rounded-lg border border-rose-200 bg-rose-50 p-4 text-left transition hover:border-rose-400 dark:border-rose-900/50 dark:bg-rose-950/30 dark:hover:border-rose-700"
          >
            <div className="font-medium text-rose-900 dark:text-rose-200">
              교체 (Replace)
            </div>
            <div className="mt-1 text-xs text-rose-700 dark:text-rose-300/80">
              이 팩의 모든 기존 AI 데이터(생성 단어/예문 + 모든 해설)를
              삭제한 뒤 가져오기 파일로 채웁니다. 시드 데이터는 유지됩니다.
            </div>
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
