import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Spinner } from "~/components/Spinner";
import type { WordTestKind } from "~/lib/idb/types";
import type { HomePack, HomeGrammarPack } from "~/lib/idb/home";
import { createWordTest } from "~/lib/idb/word-test";
import { createGrammarTest } from "~/lib/idb/grammar-test";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

type Mode = WordTestKind | "grammar";

export function CreateTestModal({
  packs,
  grammarPacks,
  onClose,
}: {
  packs: HomePack[];
  grammarPacks: HomeGrammarPack[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("meaning");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const isLoading = status.kind === "loading";
  const isGrammar = mode === "grammar";

  // 모드에 따라 어느 팩 풀을 보여줄지. 모드 바뀌면 selection 초기화.
  const activePacks = useMemo(
    () =>
      isGrammar
        ? grammarPacks.map((p) => ({
            key: p.key,
            title: p.title,
            count: p.count,
          }))
        : packs.map((p) => ({
            key: p.key,
            title: p.title,
            count: p.wordCount,
          })),
    [isGrammar, packs, grammarPacks],
  );

  function changeMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setSelected(new Set());
  }

  function toggle(pack: { key: string; count: number }) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pack.key)) next.delete(pack.key);
      else next.add(pack.key);
      return next;
    });
  }

  const totalSelected = [...selected].reduce((sum, key) => {
    const pack = activePacks.find((p) => p.key === key);
    return sum + (pack?.count ?? 0);
  }, 0);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setStatus({ kind: "error", message: "시험장 이름을 입력해 주세요." });
      return;
    }
    if (selected.size === 0) {
      setStatus({ kind: "error", message: "팩을 하나 이상 선택해 주세요." });
      return;
    }
    setStatus({ kind: "loading" });
    try {
      const packs = [...selected].map((packKey) => ({
        packKey,
        count: "all" as const,
      }));
      if (isGrammar) {
        const data = await createGrammarTest({ name: trimmed, packs });
        onClose();
        navigate(`/grammar-test/${data.testId}`);
      } else {
        const data = await createWordTest({
          name: trimmed,
          kind: mode,
          packs,
        });
        onClose();
        navigate(`/word-test/${data.testId}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/40"
        onClick={isLoading ? undefined : onClose}
      />
      <div className="relative max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          시험 만들기
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          {isGrammar
            ? "선택한 문법팩의 항목을 무작위로 뽑아 시험장을 만듭니다."
            : "선택한 한자팩의 단어를 무작위로 뽑아 시험장을 만듭니다."}
        </p>

        <div className="mt-5">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            모드 <span className="text-rose-500">*</span>
          </span>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            <KindOption
              active={mode === "meaning"}
              onClick={() => changeMode("meaning")}
              disabled={isLoading}
              title="단어 시험"
              description="JP ↔ KO 4지선다"
            />
            <KindOption
              active={mode === "reading"}
              onClick={() => changeMode("reading")}
              disabled={isLoading}
              title="한자 읽기"
              description="예문 보고 발음 4지선다"
            />
            <KindOption
              active={mode === "grammar"}
              onClick={() => changeMode("grammar")}
              disabled={isLoading || grammarPacks.length === 0}
              title="문법"
              description={
                grammarPacks.length === 0
                  ? "문법팩 없음"
                  : "활용/조사/형태/한↔일"
              }
            />
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            시험장 이름 <span className="text-rose-500">*</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              isGrammar ? "예: N5 문법 1회차" : "예: N5 단어 1회차"
            }
            disabled={isLoading}
            className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>

        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              팩 선택 <span className="text-rose-500">*</span>
            </span>
            <span className="text-xs tabular-nums text-neutral-500">
              총 {totalSelected} 문제
            </span>
          </div>
          <div className="space-y-2">
            {activePacks.length === 0 ? (
              <p className="rounded-md border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400 dark:border-neutral-700">
                {isGrammar
                  ? "문법팩이 없습니다. 시드 다시 설치 후 시도하세요."
                  : "사용 가능한 팩이 없습니다."}
              </p>
            ) : (
              activePacks.map((pack) => {
                const isOn = selected.has(pack.key);
                return (
                  <label
                    key={pack.key}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition ${
                      isOn
                        ? "border-neutral-900 bg-neutral-50 dark:border-neutral-100 dark:bg-neutral-900"
                        : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
                    } ${pack.count === 0 ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() => toggle(pack)}
                        disabled={isLoading || pack.count === 0}
                        className="h-4 w-4 accent-neutral-900 dark:accent-neutral-100"
                      />
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">
                        {pack.title}
                      </span>
                    </div>
                    <span className="text-xs tabular-nums text-neutral-500">
                      {pack.count}개
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {status.kind === "error" && (
          <p className="mt-4 text-sm text-rose-600">{status.message}</p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isLoading || totalSelected === 0 || !name.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {isLoading && <Spinner className="h-3.5 w-3.5" />}
            시험 생성
          </button>
        </div>
      </div>
    </div>
  );
}

function KindOption({
  active,
  onClick,
  disabled,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-lg border p-3 text-left transition disabled:opacity-50 ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300"
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div
        className={`mt-0.5 text-xs ${
          active
            ? "opacity-80"
            : "text-neutral-500 dark:text-neutral-400"
        }`}
      >
        {description}
      </div>
    </button>
  );
}
