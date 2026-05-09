import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Spinner } from "~/components/Spinner";
import type { Pack } from "~/lib/db";

type Status =
  | { kind: "idle" }
  | { kind: "loading"; filename: string }
  | { kind: "error"; message: string };

export function ImportButton() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onFile(file: File) {
    setStatus({ kind: "loading", filename: file.name });
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/pack/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      const data = (await res.json()) as { pack: Pack };
      setStatus({ kind: "idle" });
      navigate(`/study/${encodeURIComponent(data.pack.key)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "import failed";
      setStatus({ kind: "error", message });
    }
  }

  return (
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
  );
}
