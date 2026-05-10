import { useRef, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";
import { Spinner } from "~/components/Spinner";
import { importPack, type PackImportInput } from "~/lib/idb/pack";
import {
  importJlptDelta,
  type PackExport,
} from "~/lib/idb/pack-import-delta";
import { importGrammarDelta } from "~/lib/idb/grammar-pack-import-delta";
import type { GrammarPackExport } from "~/lib/idb/grammar-pack-export";

type Status =
  | { kind: "idle" }
  | { kind: "loading"; filename: string }
  | { kind: "error"; message: string }
  | { kind: "delta-pending"; filename: string; body: DeltaBody }
  | {
      kind: "grammar-delta-pending";
      filename: string;
      body: GrammarPackExport;
    };

// Lightweight shape — full type lives on the server.
type DeltaBody = {
  kind: "jlpt-delta";
  key: string;
  title: string;
  items: Array<{ kanjiCharacter: string; words: unknown[] }>;
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

      if (
        json?.kind === "jlpt-grammar-delta" ||
        json?.kind === "custom-grammar-full"
      ) {
        setStatus({
          kind: "grammar-delta-pending",
          filename: file.name,
          body: json,
        });
        return;
      }

      // Anything else: treat as full pack (custom-full export OR raw seed JSON).
      await runImport(json, file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : "import failed";
      setStatus({ kind: "error", message });
    }
  }

  async function runImport(
    payload: PackImportInput | (PackExport & { mode?: "replace" | "merge" }),
    filename: string,
  ) {
    setStatus({ kind: "loading", filename });

    if ((payload as PackExport).kind === "jlpt-delta") {
      const exp = payload as PackExport & { mode?: "replace" | "merge" };
      const mode = exp.mode === "merge" ? "merge" : "replace";
      const r = await importJlptDelta(exp, mode);
      setStatus({ kind: "idle" });
      revalidator.revalidate();
      const summary =
        `${r.packKey} ${r.mode === "replace" ? "교체" : "병합"} 완료 — ` +
        `+${r.insertedWords} 단어 / +${r.insertedExamples} 예문` +
        (r.skippedWords > 0 ? ` · 중복 ${r.skippedWords} 건 스킵` : "") +
        (r.unknownKanji.length > 0
          ? ` · 알 수 없는 한자 ${r.unknownKanji.length} 건`
          : "");
      if (typeof window !== "undefined") window.alert(summary);
      return;
    }

    // Custom-full export OR raw seed JSON
    const { pack } = await importPack(payload as PackImportInput, {
      allowJlpt: false,
    });
    setStatus({ kind: "idle" });
    navigate(`/study/${encodeURIComponent(pack.key)}`);
  }

  async function applyDelta(mode: "replace" | "merge") {
    if (status.kind !== "delta-pending") return;
    const { body, filename } = status;
    try {
      // DeltaBody is a subset of PackExport; the file we read had the full shape.
      await runImport(
        { ...(body as unknown as PackExport), mode },
        filename,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "import failed";
      setStatus({ kind: "error", message });
    }
  }

  async function applyGrammarDelta(mode: "replace" | "merge") {
    if (status.kind !== "grammar-delta-pending") return;
    const { body, filename } = status;
    setStatus({ kind: "loading", filename });
    try {
      const r = await importGrammarDelta(body, mode);
      setStatus({ kind: "idle" });
      revalidator.revalidate();
      const summary =
        `${r.packKey} ${r.mode === "replace" ? "교체" : "병합"} 완료 — ` +
        `+${r.attachedItemExplanations} 항목 해설 / ` +
        `+${r.attachedExampleExplanations} 예문 해설 / ` +
        `+${r.attachedQuizExplanations} 퀴즈 해설 / ` +
        `+${r.insertedGeneratedExamples} 추가 예문 / ` +
        `+${r.insertedGeneratedQuizzes} 추가 퀴즈` +
        (r.unknownPatterns.length > 0
          ? ` · 알 수 없는 패턴 ${r.unknownPatterns.length} 건`
          : "") +
        (r.warnings.length > 0 ? ` · 경고 ${r.warnings.length} 건` : "");
      if (typeof window !== "undefined") window.alert(summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : "import failed";
      setStatus({ kind: "error", message });
    }
  }

  function cancelDelta() {
    if (
      status.kind === "delta-pending" ||
      status.kind === "grammar-delta-pending"
    )
      setStatus({ kind: "idle" });
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

      {status.kind === "grammar-delta-pending" && (
        <GrammarDeltaModeModal
          body={status.body}
          onPick={applyGrammarDelta}
          onCancel={cancelDelta}
        />
      )}
    </>
  );
}

function GrammarDeltaModeModal({
  body,
  onPick,
  onCancel,
}: {
  body: GrammarPackExport;
  onPick: (mode: "replace" | "merge") => void;
  onCancel: () => void;
}) {
  const itemCount = body.items.length;
  const exampleExplCount = body.items.reduce(
    (n, it) => n + it.seedExampleExplanations.length,
    0,
  );
  const quizExplCount = body.items.reduce(
    (n, it) => n + it.seedQuizExplanations.length,
    0,
  );
  const itemExplCount = body.items.filter((it) => it.deepExplanation).length;
  const generatedExampleCount = body.items.reduce(
    (n, it) => n + it.generatedExamples.length,
    0,
  );
  const generatedQuizCount = body.items.reduce(
    (n, it) => n + it.generatedQuizzes.length,
    0,
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-neutral-900/40" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {body.title || body.key} — 문법 해설 가져오기
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          AI 데이터 delta — {itemCount} 항목 / 항목 해설 {itemExplCount} /
          시드 예문 해설 {exampleExplCount} / 시드 퀴즈 해설 {quizExplCount}
          {generatedExampleCount + generatedQuizCount > 0
            ? ` / 추가 예문 ${generatedExampleCount} / 추가 퀴즈 ${generatedQuizCount}`
            : ""}
          . 어떻게 적용할까요?
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
              기존 해설은 그대로 두고, 비어 있는 자리에만 가져온 해설을
              채웁니다. 안전.
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
              이 팩의 모든 기존 해설(항목/예문/퀴즈)을 비운 뒤 가져온 해설로
              채웁니다. 시드 본문 (pattern, examples, quizzes) 은 유지.
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
