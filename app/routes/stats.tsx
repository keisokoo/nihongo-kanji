import { Link } from "react-router";
import type { Route } from "./+types/stats";
import {
  loadStatsData,
  type AiUsageStats,
  type DailyCount,
} from "~/lib/idb/stats";

export async function clientLoader() {
  return loadStatsData();
}

export function meta() {
  return [{ title: "학습 통계 — Nihongo" }];
}

export default function Stats({ loaderData }: Route.ComponentProps) {
  const { storage, tests, ai, recent, topWrong, aiUsage } = loaderData;
  const wordPct =
    tests.word.answered > 0
      ? Math.round((tests.word.correct / tests.word.answered) * 100)
      : null;
  const grammarPct =
    tests.grammar.answered > 0
      ? Math.round((tests.grammar.correct / tests.grammar.answered) * 100)
      : null;

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ← 메인
          </Link>
          <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl dark:text-neutral-100">
            학습 통계
          </h1>
          <span />
        </header>

        <Section title="저장소">
          <StatGrid>
            <StatCard label="한자" value={storage.kanji} />
            <StatCard label="단어" value={storage.words} />
            <StatCard label="예문" value={storage.examples} />
            <StatCard label="문법 항목" value={storage.grammarItems} />
          </StatGrid>
        </Section>

        <Section title="시험">
          <StatGrid>
            <StatCard
              label="단어 / 한자읽기"
              value={tests.word.tests}
              caption={
                tests.word.answered > 0
                  ? `${tests.word.answered}문 풀고 평균 ${wordPct}%`
                  : "아직 시험 없음"
              }
            />
            <StatCard
              label="문법"
              value={tests.grammar.tests}
              caption={
                tests.grammar.answered > 0
                  ? `${tests.grammar.answered}문 풀고 평균 ${grammarPct}%`
                  : "아직 시험 없음"
              }
            />
          </StatGrid>
        </Section>

        <Section title="최근 7일">
          {recent.every((d) => d.answered === 0) ? (
            <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400 dark:border-neutral-700">
              최근 7일 동안 푼 문제가 없어요.
            </p>
          ) : (
            <RecentChart data={recent} />
          )}
        </Section>

        <Section title="AI 생성 누적">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-neutral-400">
              AI 가 생성한 데이터 (목록 보기)
            </span>
            <Link
              to="/ai-data"
              className="text-xs text-sky-600 underline hover:text-sky-700 dark:text-sky-400"
            >
              생성물 모아보기 →
            </Link>
          </div>
          <StatGrid>
            <StatCard label="추가 단어" value={ai.generatedWords} />
            <StatCard label="추가 예문" value={ai.generatedExamples} />
            <StatCard label="단어 해설" value={ai.wordExplanations} />
            <StatCard label="예문 해설" value={ai.exampleExplanations} />
            <StatCard label="문법 항목 해설" value={ai.grammarItemExplanations} />
            <StatCard label="문법 활용 가이드" value={ai.grammarUsageGuides} />
            <StatCard
              label="문법 예문 해설"
              value={ai.grammarExampleExplanations}
            />
            <StatCard
              label="문법 퀴즈 해설"
              value={ai.grammarQuizExplanations}
            />
            <StatCard
              label="문법 추가 예문/퀴즈"
              value={ai.generatedGrammarExamples + ai.generatedGrammarQuizzes}
              caption={`예문 ${ai.generatedGrammarExamples} / 퀴즈 ${ai.generatedGrammarQuizzes}`}
            />
          </StatGrid>
        </Section>

        <Section title="AI 사용량 / 비용 추정">
          <AiUsagePanel usage={aiUsage} />
        </Section>

        {topWrong.length > 0 && (
          <Section title="자주 틀리는 항목 TOP 8">
            <ul className="space-y-2">
              {topWrong.map((it, i) => (
                <li
                  key={`${it.kind}-${it.label}-${i}`}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <span className="w-6 shrink-0 text-xs tabular-nums text-neutral-400">
                    {i + 1}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                      it.kind === "grammar"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    {it.kind === "grammar" ? "문법" : "단어"}
                  </span>
                  <span className="flex-1 truncate text-base font-medium [font-family:'Noto_Sans_JP',sans-serif] text-neutral-900 dark:text-neutral-100">
                    {it.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-rose-600 dark:text-rose-400">
                    {it.wrongCount} / {it.totalCount} 틀림
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: number | string;
  caption?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
        {value}
      </div>
      {caption && (
        <div className="mt-0.5 text-xs text-neutral-400">{caption}</div>
      )}
    </div>
  );
}

function AiUsagePanel({ usage }: { usage: AiUsageStats }) {
  if (usage.totalCalls === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400 dark:border-neutral-700">
        아직 AI 호출 기록이 없어요.
      </p>
    );
  }
  const FEATURE_LABELS: Record<string, string> = {
    "example": "단어 예문 생성",
    "word": "단어 추가",
    "explanation": "단어 해설",
    "readings": "한자 음/훈독 재생성",
    "meaning": "한자 의미 생성",
    "example-explanation": "예문 해설",
    "grammar-item-explanation": "문법 항목 해설",
    "grammar-example-explanation": "문법 예문 해설",
    "grammar-quiz-explanation": "문법 퀴즈 해설",
    "grammar-example": "문법 예문 추가",
    "grammar-quiz": "문법 퀴즈 추가",
    tts: "음성 (TTS)",
  };
  const totalRecent = usage.recentCost.reduce((s, x) => s + x.costUsd, 0);
  const maxDay = Math.max(0.000001, ...usage.recentCost.map((x) => x.costUsd));

  return (
    <div className="space-y-4">
      <StatGrid>
        <StatCard
          label="총 호출"
          value={usage.totalCalls}
          caption={`Input ${formatTokens(usage.totalInputTokens)} / Output ${formatTokens(usage.totalOutputTokens)}`}
        />
        <StatCard
          label="누적 비용"
          value={`$${usage.totalCostUsd.toFixed(4)}`}
          caption="알려진 모델만 추정"
        />
        <StatCard
          label="최근 7일"
          value={`$${totalRecent.toFixed(4)}`}
          caption={`${usage.recentCost.filter((x) => x.costUsd > 0).length}일 사용`}
        />
      </StatGrid>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          최근 7일 비용 추정
        </h3>
        <div className="flex h-24 items-end gap-2">
          {usage.recentCost.map((d) => {
            const heightPct = (d.costUsd / maxDay) * 100;
            return (
              <div
                key={d.date}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${d.date} — $${d.costUsd.toFixed(4)}`}
              >
                <div className="w-full flex-1 flex flex-col justify-end">
                  {d.costUsd > 0 ? (
                    <div
                      className="w-full rounded-sm bg-sky-500 dark:bg-sky-600"
                      style={{ height: `${heightPct}%` }}
                    />
                  ) : (
                    <div className="h-1 w-full rounded-sm bg-neutral-100 dark:bg-neutral-800" />
                  )}
                </div>
                <div className="text-[10px] tabular-nums text-neutral-500">
                  {d.date.slice(5)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {usage.byFeature.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            기능별
          </h3>
          <ul className="space-y-1.5 text-sm">
            {usage.byFeature.slice(0, 12).map((f) => (
              <li
                key={f.feature}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="truncate text-neutral-700 dark:text-neutral-300">
                  {FEATURE_LABELS[f.feature] ?? f.feature}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-neutral-500">
                  {f.calls}회 · {formatTokens(f.inputTokens + f.outputTokens)}t
                  {" · "}
                  <span className="text-neutral-700 dark:text-neutral-200">
                    ${f.costUsd.toFixed(4)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {usage.byModel.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            모델별
          </h3>
          <ul className="space-y-1.5 text-sm">
            {usage.byModel.map((m) => (
              <li
                key={m.model}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="truncate text-neutral-700 dark:text-neutral-300">
                  {m.model}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-neutral-500">
                  {m.calls}회 · {formatTokens(m.inputTokens + m.outputTokens)}t
                  {" · "}
                  <span className="text-neutral-700 dark:text-neutral-200">
                    ${m.costUsd.toFixed(4)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function RecentChart({ data }: { data: DailyCount[] }) {
  const max = Math.max(1, ...data.map((d) => d.answered));
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex h-32 items-end gap-2">
        {data.map((d) => {
          const heightPct = (d.answered / max) * 100;
          const correctPct =
            d.answered > 0 ? (d.correct / d.answered) * 100 : 0;
          const incorrectPct = 100 - correctPct;
          return (
            <div
              key={d.date}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${d.date} — ${d.answered}문 (정답 ${d.correct})`}
            >
              <div className="w-full flex-1 flex flex-col justify-end">
                {d.answered > 0 ? (
                  <div
                    className="w-full overflow-hidden rounded-sm"
                    style={{ height: `${heightPct}%` }}
                  >
                    <div
                      className="bg-rose-300 dark:bg-rose-900/60"
                      style={{ height: `${incorrectPct}%` }}
                    />
                    <div
                      className="bg-emerald-500 dark:bg-emerald-600"
                      style={{ height: `${correctPct}%` }}
                    />
                  </div>
                ) : (
                  <div className="h-1 w-full rounded-sm bg-neutral-100 dark:bg-neutral-800" />
                )}
              </div>
              <div className="text-[10px] tabular-nums text-neutral-500">
                {d.date.slice(5)}
              </div>
              <div className="text-[10px] tabular-nums text-neutral-400">
                {d.answered}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-end gap-3 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded bg-emerald-500" /> 정답
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded bg-rose-300" /> 오답
        </span>
      </div>
    </div>
  );
}
