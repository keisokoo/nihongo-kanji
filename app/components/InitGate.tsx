import { useEffect, useState } from "react";
import { Spinner } from "./Spinner";
import {
  isInitialized,
  loadSettings,
  saveSettings,
} from "~/lib/idb/settings";
import { installSeeds, type SeedProgress } from "~/lib/idb/seed-install";

type Phase =
  | { kind: "checking" }
  | { kind: "ready" }
  | { kind: "wizard"; step: WizardStep };

type WizardStep =
  | { kind: "keys" }
  | { kind: "installing"; progress: SeedProgress | null; error: string | null };

/**
 * Wraps the app: while IndexedDB isn't fully initialized (no seeds), show the
 * setup wizard. Once initialized, render children. Pure client-side; on the
 * server it just renders a loading shell so SSR HTML doesn't crash.
 */
export function InitGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ready = await isInitialized();
        if (cancelled) return;
        setPhase(ready ? { kind: "ready" } : { kind: "wizard", step: { kind: "keys" } });
      } catch (err) {
        console.error("[InitGate] check failed", err);
        if (!cancelled) {
          setPhase({ kind: "wizard", step: { kind: "keys" } });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase.kind === "checking") {
    return <LoadingShell label="앱 초기화 확인 중…" />;
  }
  if (phase.kind === "ready") {
    return <>{children}</>;
  }
  return <SetupWizard step={phase.step} setPhase={setPhase} />;
}

function LoadingShell({ label }: { label: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Spinner className="h-4 w-4" />
        {label}
      </div>
    </main>
  );
}

function SetupWizard({
  step,
  setPhase,
}: {
  step: WizardStep;
  setPhase: (p: Phase) => void;
}) {
  const [anthropic, setAnthropic] = useState("");
  const [gemini, setGemini] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [secureCtxOk, setSecureCtxOk] = useState<boolean>(true);

  // Pre-fill any previously saved keys.
  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      if (s.anthropicApiKey) setAnthropic(s.anthropicApiKey);
      if (s.geminiApiKey) setGemini(s.geminiApiKey);
    })();
    // crypto.subtle is gated to secure contexts (HTTPS/localhost). LAN-IP HTTP
    // dev (e.g. http://192.168.x.x:5173) fails silently here without a hint.
    if (typeof window !== "undefined") {
      const isSecure =
        window.isSecureContext === true && !!window.crypto?.subtle;
      setSecureCtxOk(isSecure);
    }
  }, []);

  async function handleSave() {
    setSaveError(null);
    try {
      await saveSettings({
        anthropicApiKey: anthropic.trim() || null,
        geminiApiKey: gemini.trim() || null,
      });
      setPhase({
        kind: "wizard",
        step: { kind: "installing", progress: null, error: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError(message);
    }
  }

  if (step.kind === "keys") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10 dark:bg-neutral-950">
        <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            Nihongo 초기 설정
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            모든 데이터는 이 브라우저의 IndexedDB에 저장됩니다. API 키는
            본인의 키를 직접 입력해주세요. 키는 외부로 전송되지 않고 이
            기기에서만 사용됩니다.
          </p>

          <div className="mt-5 space-y-4">
            <KeyInput
              label="ANTHROPIC_API_KEY"
              hint="Claude로 단어/예문/해설 생성 (선택)"
              value={anthropic}
              onChange={setAnthropic}
            />
            <KeyInput
              label="GEMINI_API_KEY"
              hint="Gemini TTS로 발음 재생 (선택). Anthropic 키가 없으면 Gemini가 텍스트 생성도 담당"
              value={gemini}
              onChange={setGemini}
            />
          </div>

          <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            ⚠ 두 키 모두 비워둬도 학습은 가능하지만 AI 생성·TTS는 동작하지
            않습니다. 키는 AES-GCM 256으로 암호화해서 IndexedDB에 저장하고,
            wrapping key 자체도 추출 불가능(non-extractable) 형태로 보관해요.
            DevTools/IDB 덤프 같은 가벼운 노출은 막지만 XSS / 악성 확장 등
            같은 origin에서 JS를 실행하는 위협으로부터는 보호되지 않습니다.
          </div>

          {!secureCtxOk && (
            <div className="mt-3 rounded-md bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
              ❌ 보안 컨텍스트(secure context)가 아닙니다 — WebCrypto가
              비활성화되어 키 저장이 불가합니다. <strong>HTTPS</strong> 또는{" "}
              <code>http://localhost</code> 로 접속해 주세요. LAN IP HTTP에선
              동작하지 않습니다.
            </div>
          )}

          {saveError && (
            <div className="mt-3 rounded-md bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
              저장 실패: {saveError}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!secureCtxOk}
              className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-5 py-2.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
            >
              다음 — 시드 데이터 설치
            </button>
          </div>
        </div>
      </main>
    );
  }

  return <SeedInstaller setPhase={setPhase} />;
}

function KeyInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="text-xs text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          {show ? "숨기기" : "보기"}
        </button>
      </div>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="(비워두면 미사용)"
        autoComplete="off"
        className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      />
      <span className="mt-1 block text-xs text-neutral-500">{hint}</span>
    </label>
  );
}

function SeedInstaller({ setPhase }: { setPhase: (p: Phase) => void }) {
  const [progress, setProgress] = useState<SeedProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await installSeeds((p) => {
          if (!cancelled) setProgress(p);
        });
        if (cancelled) return;
        // Hard reload — clientLoaders that already ran with empty IDB need to
        // re-fetch with the new state. Cheaper / more reliable than threading
        // revalidation through the gate.
        if (typeof window !== "undefined") {
          window.location.reload();
        } else {
          setPhase({ kind: "ready" });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "install failed";
        if (!cancelled) setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10 dark:bg-neutral-950">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
          시드 데이터 설치 중…
        </h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          JLPT N5 ~ N1 한자/단어/예문 (~7,500개) 을 IndexedDB에 적재합니다.
          처음 한 번만 실행됩니다.
        </p>

        <div className="mt-5">
          <ProgressBlock progress={progress} />
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            설치 실패: {error}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setPhase({
                    kind: "wizard",
                    step: { kind: "installing", progress: null, error: null },
                  })
                }
                className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs hover:border-rose-400"
              >
                다시 시도
              </button>
              <button
                type="button"
                onClick={() =>
                  setPhase({ kind: "wizard", step: { kind: "keys" } })
                }
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
              >
                ← 키 입력으로
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function ProgressBlock({ progress }: { progress: SeedProgress | null }) {
  if (!progress || progress.kind === "manifest") {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Spinner className="h-4 w-4" />
        매니페스트 로드 중…
      </div>
    );
  }
  if (progress.kind === "fetching" || progress.kind === "applying") {
    const pct = Math.round(((progress.index + (progress.kind === "applying" ? 0.5 : 0)) / progress.total) * 100);
    const tag = progress.pack === "grammar" ? "문법" : "한자";
    return (
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-700 dark:text-neutral-300">
            {progress.kind === "fetching" ? "다운로드" : "적용"}{" "}
            <strong>
              {tag} {progress.level}
            </strong>
          </span>
          <span className="tabular-nums text-neutral-500">
            {progress.index + 1} / {progress.total}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className="h-full bg-neutral-900 transition-all dark:bg-neutral-100"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }
  if (progress.kind === "applied") {
    if (progress.pack === "kanji") {
      return (
        <div className="text-sm text-emerald-600 dark:text-emerald-400">
          한자 {progress.level} 적용 완료 — 한자 {progress.stats.kanji} / 단어{" "}
          {progress.stats.words} / 예문 {progress.stats.examples}
        </div>
      );
    }
    return (
      <div className="text-sm text-emerald-600 dark:text-emerald-400">
        문법 {progress.level} 적용 완료 — 항목 {progress.stats.items} / 예문{" "}
        {progress.stats.examples} / 퀴즈 {progress.stats.quizzes}
      </div>
    );
  }
  if (progress.kind === "done") {
    return (
      <div className="text-sm text-emerald-600 dark:text-emerald-400">
        설치 완료. 잠시 후 메인 화면으로 이동합니다…
      </div>
    );
  }
  return null;
}
