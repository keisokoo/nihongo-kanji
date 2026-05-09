import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/settings";
import { loadSettings, saveSettings } from "~/lib/idb/settings";
import { resetDb } from "~/lib/idb/db";
import { installSeeds } from "~/lib/idb/seed-install";
import { loadUsage, type IdbUsage } from "~/lib/idb/usage";
import { Spinner } from "~/components/Spinner";
import { ConfirmModal } from "~/components/ConfirmModal";

export function meta({}: Route.MetaArgs) {
  return [{ title: "설정 — Nihongo" }];
}

export default function Settings() {
  const navigate = useNavigate();
  const [anthropic, setAnthropic] = useState("");
  const [gemini, setGemini] = useState("");
  const [showA, setShowA] = useState(false);
  const [showG, setShowG] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [reseeding, setReseeding] = useState(false);
  const [reseedMsg, setReseedMsg] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [usage, setUsage] = useState<IdbUsage | null>(null);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setAnthropic(s.anthropicApiKey ?? "");
      setGemini(s.geminiApiKey ?? "");
      setUsage(await loadUsage());
    })();
  }, []);

  async function refreshUsage() {
    setUsage(await loadUsage());
  }

  async function save() {
    await saveSettings({
      anthropicApiKey: anthropic.trim() || null,
      geminiApiKey: gemini.trim() || null,
    });
    setSavedAt(Date.now());
  }

  async function reseed() {
    setReseeding(true);
    setReseedMsg(null);
    try {
      const totals = await installSeeds((p) => {
        if (p.kind === "applying") setReseedMsg(`${p.level} 적용 중…`);
      });
      setReseedMsg(
        `완료 — 한자 ${totals.totalKanji}, 단어 ${totals.totalWords}, 예문 ${totals.totalExamples}`,
      );
      refreshUsage();
    } catch (err) {
      setReseedMsg(`실패: ${err instanceof Error ? err.message : "error"}`);
    } finally {
      setReseeding(false);
    }
  }

  async function reset() {
    setResetting(true);
    try {
      await resetDb();
      navigate("/");
      // Force reload so InitGate re-runs from scratch.
      if (typeof window !== "undefined") window.location.reload();
    } catch (err) {
      console.error(err);
      setResetting(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-8 sm:py-12">
        <header className="mb-8 flex items-center gap-4">
          <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            ← 메인
          </Link>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 sm:text-2xl">
            설정
          </h1>
        </header>

        <section className="mb-8 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            API 키
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            AES-GCM으로 암호화해서 이 브라우저의 IndexedDB에만 저장돼요.
            wrapping key는 non-extractable. DevTools/덤프 노출은 막지만
            XSS·악성 확장처럼 같은 origin에서 JS가 실행되는 위협은 막을
            수 없습니다.
          </p>

          <div className="mt-4 space-y-4">
            <KeyField
              label="ANTHROPIC_API_KEY"
              value={anthropic}
              onChange={setAnthropic}
              show={showA}
              onToggleShow={() => setShowA((v) => !v)}
              hint="Claude로 단어/예문/해설 생성. 비워두면 Gemini가 텍스트 생성도 담당."
            />
            <KeyField
              label="GEMINI_API_KEY"
              value={gemini}
              onChange={setGemini}
              show={showG}
              onToggleShow={() => setShowG((v) => !v)}
              hint="Gemini TTS로 발음 재생. 둘 다 비워두면 AI 기능은 동작하지 않습니다."
            />
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
            >
              저장
            </button>
            {savedAt && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                저장됨 — {new Date(savedAt).toLocaleTimeString("ko-KR")}
              </span>
            )}
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            시드 다시 설치
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            번들된 JLPT N5–N1 시드를 IndexedDB에 다시 적용합니다. AI로 추가한
            단어/예문/해설은 보존됩니다 (시드 한자만 갱신).
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={reseeding}
              onClick={reseed}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            >
              {reseeding && <Spinner className="h-3.5 w-3.5" />}
              시드 다시 설치
            </button>
            {reseedMsg && (
              <span className="text-xs text-neutral-500">{reseedMsg}</span>
            )}
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              저장소 사용량
            </h2>
            <button
              type="button"
              onClick={refreshUsage}
              className="text-xs text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              새로고침
            </button>
          </div>
          {usage ? (
            <UsagePanel usage={usage} />
          ) : (
            <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
              <Spinner className="h-4 w-4" />
              계산 중…
            </div>
          )}
        </section>

        <section className="mb-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 dark:border-rose-900/50 dark:bg-rose-950/30">
          <h2 className="text-base font-semibold text-rose-900 dark:text-rose-200">
            전체 초기화 (위험)
          </h2>
          <p className="mt-1 text-xs text-rose-700 dark:text-rose-300/80">
            IndexedDB 의 모든 데이터(API 키, 팩, AI 생성물, 단어 시험 진행도)
            를 삭제합니다. 되돌릴 수 없습니다.
          </p>
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            disabled={resetting}
            className="mt-4 rounded-md bg-rose-600 px-4 py-2 text-sm text-white hover:bg-rose-700 disabled:opacity-50"
          >
            전체 초기화
          </button>
        </section>

        <ConfirmModal
          open={showResetModal}
          title="전체 초기화"
          body={
            <>
              <p>모든 IndexedDB 데이터를 삭제합니다. 되돌릴 수 없습니다.</p>
              <p className="mt-2 text-xs text-neutral-500">
                삭제 후 초기 설정 화면이 다시 나타납니다.
              </p>
            </>
          }
          confirmLabel="삭제"
          destructive
          onConfirm={() => {
            setShowResetModal(false);
            reset();
          }}
          onCancel={() => setShowResetModal(false)}
        />
      </div>
    </main>
  );
}

function KeyField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  hint: string;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {label}
        </span>
        <button
          type="button"
          onClick={onToggleShow}
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

function UsagePanel({ usage }: { usage: IdbUsage }) {
  const pct =
    usage.quota > 0 ? Math.min(100, (usage.usage / usage.quota) * 100) : 0;
  return (
    <div className="mt-4 space-y-4">
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-neutral-700 dark:text-neutral-300">
            {fmtBytes(usage.usage)}
            <span className="text-neutral-400">
              {" "}/ {fmtBytes(usage.quota)}{" "}
            </span>
            <span className="text-xs text-neutral-500">
              (브라우저 추정치)
            </span>
          </span>
          <span className="text-xs tabular-nums text-neutral-500">
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className="h-full bg-neutral-900 dark:bg-neutral-100"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
        <Row label="팩" value={usage.counts.packs} />
        <Row label="한자" value={usage.counts.kanji} />
        <Row label="readings" value={usage.counts.readings} />
        <Row label="단어" value={usage.counts.words} />
        <Row label="예문" value={usage.counts.examples} />
        <Row label="시험" value={usage.counts.wordTests} />
        <Row label="시험 항목" value={usage.counts.wordTestItems} />
        <Row
          label="TTS 캐시"
          value={`${usage.counts.audioCache} (${fmtBytes(usage.audioCacheBytes)})`}
        />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="tabular-nums text-neutral-800 dark:text-neutral-200">
        {typeof value === "number" ? value.toLocaleString() : value}
      </dd>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}
