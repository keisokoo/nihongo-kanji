import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { db } from "./db";
import { loadSettings } from "./settings";

/** AI 사용량을 IDB 에 비동기 기록. 실패 무시 (logging 으로 본 흐름 막지 않음). */
export async function logAiUsage(
  feature: string,
  model: string,
  usage: Usage,
): Promise<void> {
  try {
    await db().aiUsageLog.add({
      createdAt: new Date(),
      feature,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
    } as never);
  } catch (err) {
    console.warn("[ai-usage-log] failed:", err);
  }
}

export type Tier = "default" | "premium";

const DEFAULT_ANTHROPIC = "claude-haiku-4-5";
const PREMIUM_ANTHROPIC = "claude-sonnet-4-6";
const DEFAULT_GEMINI = "gemini-3.1-flash-lite";
const PREMIUM_GEMINI = "gemini-3-flash-preview";

const SUPPORTS_EFFORT = new Set([
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-sonnet-4-6",
]);

type Provider = "anthropic" | "gemini";

type Resolved = {
  provider: Provider;
  defaultModel: string;
  premiumModel: string;
  anthropicKey: string | null;
  geminiKey: string | null;
};

/**
 * Resolve which provider to use based on saved keys. Anthropic preferred,
 * Gemini fallback. Throws if neither is set.
 */
async function resolveProvider(): Promise<Resolved> {
  const s = await loadSettings();
  const useAnthropic = !!s.anthropicApiKey;
  const useGemini = !s.anthropicApiKey && !!s.geminiApiKey;
  if (!useAnthropic && !useGemini) {
    throw new Error(
      "AI 키 미설정 — 설정에서 ANTHROPIC_API_KEY 또는 GEMINI_API_KEY를 입력해 주세요.",
    );
  }
  return {
    provider: useAnthropic ? "anthropic" : "gemini",
    defaultModel: useAnthropic ? DEFAULT_ANTHROPIC : DEFAULT_GEMINI,
    premiumModel: useAnthropic ? PREMIUM_ANTHROPIC : PREMIUM_GEMINI,
    anthropicKey: s.anthropicApiKey,
    geminiKey: s.geminiApiKey,
  };
}

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

export const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationInputTokens:
      a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
  };
}

type Schema = Record<string, unknown>;

function geminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiSchema);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "additionalProperties") continue;
      out[k] = geminiSchema(v);
    }
    return out;
  }
  return value;
}

const DEFAULT_MAX_TOKENS = 2048;

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  schema: Schema,
  maxTokens: number = DEFAULT_MAX_TOKENS,
): Promise<{ data: unknown; usage: Usage }> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const outputConfig: Record<string, unknown> = {
    format: { type: "json_schema", schema },
  };
  if (SUPPORTS_EFFORT.has(model)) outputConfig.effort = "low";

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: outputConfig as never,
    messages: [{ role: "user", content: userMessage }],
  });

  const u = response.usage;
  const usage: Usage = {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheCreationInputTokens: u?.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: u?.cache_read_input_tokens ?? 0,
  };

  if (response.stop_reason === "max_tokens") {
    console.error("[claude] response truncated at max_tokens", {
      model,
      maxTokens,
      outputTokens: usage.outputTokens,
    });
    throw new Error(
      `AI 응답이 토큰 한도(${maxTokens})에서 잘렸습니다. 다시 시도해 주세요.`,
    );
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.error("[claude] no text content", response);
    throw new Error("Claude returned no text content");
  }

  try {
    return { data: JSON.parse(textBlock.text), usage };
  } catch {
    console.error("[claude] JSON parse failed:", textBlock.text);
    throw new Error("Claude returned invalid JSON");
  }
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  schema: Schema,
  maxTokens: number = DEFAULT_MAX_TOKENS,
): Promise<{ data: unknown; usage: Usage }> {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: geminiSchema(schema) as never,
      maxOutputTokens: maxTokens,
    },
  });

  const meta = response.usageMetadata;
  const usage: Usage = {
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: meta?.cachedContentTokenCount ?? 0,
  };

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    console.error("[gemini] response truncated at MAX_TOKENS", {
      model,
      maxTokens,
      outputTokens: usage.outputTokens,
    });
    throw new Error(
      `AI 응답이 토큰 한도(${maxTokens})에서 잘렸습니다. 다시 시도해 주세요.`,
    );
  }

  const text = response.text;
  if (!text) {
    console.error("[gemini] no text in response", response);
    throw new Error("Gemini returned no text");
  }

  try {
    return { data: JSON.parse(text), usage };
  } catch {
    console.error("[gemini] JSON parse failed:", text);
    throw new Error("Gemini returned invalid JSON");
  }
}

async function callJson(
  resolved: Resolved,
  model: string,
  systemPrompt: string,
  userMessage: string,
  schema: Schema,
  maxTokens?: number,
): Promise<{ data: unknown; usage: Usage }> {
  if (resolved.provider === "anthropic") {
    return callAnthropic(
      resolved.anthropicKey!,
      model,
      systemPrompt,
      userMessage,
      schema,
      maxTokens,
    );
  }
  return callGemini(
    resolved.geminiKey!,
    model,
    systemPrompt,
    userMessage,
    schema,
    maxTokens,
  );
}

async function withFallback<T>(
  tier: Tier,
  validate: (out: unknown) => out is T,
  call: (
    resolved: Resolved,
    model: string,
  ) => Promise<{ data: unknown; usage: Usage }>,
  label: string,
): Promise<{ result: T; modelUsed: string; usage: Usage }> {
  const resolved = await resolveProvider();
  const primary =
    tier === "premium" ? resolved.premiumModel : resolved.defaultModel;
  const fallback = resolved.premiumModel;
  let lastErr: unknown = null;
  let aggregated: Usage = ZERO_USAGE;

  try {
    const { data, usage } = await call(resolved, primary);
    aggregated = addUsage(aggregated, usage);
    // 매 호출 별 토큰 사용량을 사용량 로그에 기록 (validation 결과 무관 — 호출 비용은 발생).
    void logAiUsage(label, primary, usage);
    if (validate(data))
      return { result: data, modelUsed: primary, usage: aggregated };
    lastErr = new Error("validation failed");
    console.warn(`[claude:${label}] ${primary} produced invalid output:`, data);
  } catch (err) {
    lastErr = err;
    console.warn(`[claude:${label}] ${primary} threw:`, err);
  }

  if (tier === "default" && primary !== fallback) {
    try {
      const { data, usage } = await call(resolved, fallback);
      aggregated = addUsage(aggregated, usage);
      void logAiUsage(label, fallback, usage);
      if (validate(data)) {
        console.warn(`[claude:${label}] fell back to ${fallback} successfully`);
        return { result: data, modelUsed: fallback, usage: aggregated };
      }
      lastErr = new Error("fallback validation failed");
    } catch (err) {
      lastErr = err;
      console.error(`[claude:${label}] ${fallback} fallback threw:`, err);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ─── generateExample ────────────────────────────────────────────────────────

const EXAMPLE_SCHEMA = {
  type: "object",
  properties: {
    sentence: { type: "string" },
    translationKo: { type: "string" },
  },
  required: ["sentence", "translationKo"],
  additionalProperties: false,
} as const;

const EXAMPLE_SYSTEM_PROMPT = `You are an example-sentence generator for Korean speakers studying JLPT Japanese.

Your job: produce ONE natural Japanese sentence using a specific target word, plus a Korean translation. The sentence will be shown to a learner who must guess the reading of the target word as a quiz.

OUTPUT — return JSON with exactly two fields:
- "sentence": the Japanese sentence in inline-markup form (rules below)
- "translationKo": natural Korean translation of the sentence

INLINE MARKUP for "sentence":
- Wrap the target word EXACTLY once as {{TARGET}} — no reading shown (it's the quiz answer)
- Wrap EVERY other kanji segment as {kanji|hiragana} — the reading must be how it's actually pronounced in this sentence (account for rendaku, sokuon, etc.)
- Hiragana, katakana, particles, punctuation appear as plain text outside braces

Examples:
- target "一月" (いちがつ) → "{{一月}}は{寒|さむ}いです。"
- target "学校" (がっこう) → "{毎日|まいにち}{{学校}}に{通|かよ}っています。"
- target "食べる" (たべる) → "{毎朝|まいあさ}パンを{{食べます}}。"
- target "三人" (さんにん) → "{家族|かぞく}は{{三人}}です。"

CONSTRAINTS:
- Sentence appropriate for the given JLPT level (N5 = simplest, N4 = elementary, N3 = intermediate)
- The target word must appear exactly once in the sentence
- Every non-target kanji MUST have a {kanji|hiragana} annotation — leaving any kanji unannotated breaks the renderer
- Do NOT use the focus kanji elsewhere in the sentence (only inside the target word)
- Sentence ends with 。 or appropriate punctuation
- Keep it short and natural; avoid overly complex grammar
- If "Existing examples" are given, generate a DIFFERENT sentence (different topic/structure)`;

export type GenerateExampleInput = {
  word: string;
  wordReading: string;
  kanjiChar: string;
  level: string;
  excludeSentences?: string[];
};

export type GenerateExampleOutput = {
  sentence: string;
  translationKo: string;
};

function isExampleOutput(x: unknown): x is GenerateExampleOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.sentence === "string" && typeof o.translationKo === "string";
}

export async function generateExample(
  input: GenerateExampleInput,
  tier: Tier = "default",
): Promise<{ result: GenerateExampleOutput; modelUsed: string; usage: Usage }> {
  const userMessage = [
    `Target word: ${input.word}`,
    `Reading: ${input.wordReading}`,
    `Focus kanji: ${input.kanjiChar}`,
    `JLPT Level: ${input.level}`,
    input.excludeSentences && input.excludeSentences.length > 0
      ? `\nExisting examples (DO NOT duplicate these or vary only slightly):\n${input.excludeSentences.map((s) => `- ${s}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return withFallback<GenerateExampleOutput>(
    tier,
    isExampleOutput,
    (resolved, model) =>
      callJson(
        resolved,
        model,
        EXAMPLE_SYSTEM_PROMPT,
        userMessage,
        EXAMPLE_SCHEMA,
      ),
    "example",
  );
}

// ─── generateWord ───────────────────────────────────────────────────────────

const WORD_SCHEMA = {
  type: "object",
  properties: {
    word: { type: "string" },
    wordReading: { type: "string" },
    kanjiReading: { type: "string" },
    meaningsKo: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["word", "wordReading", "kanjiReading", "meaningsKo"],
  additionalProperties: false,
} as const;

const WORD_SYSTEM_PROMPT = `You are a Japanese vocabulary generator for Korean JLPT learners.

Given a target kanji and JLPT level, output ONE Japanese word that contains the target kanji. Return JSON:
{
  "word": "<word containing the target kanji, e.g. 学校>",
  "wordReading": "<full hiragana reading of the word, e.g. がっこう>",
  "kanjiReading": "<reading of the TARGET KANJI within this word — KATAKANA for on-yomi (音読み), HIRAGANA for kun-yomi (訓読み)>",
  "meaningsKo": ["<1-3 short Korean translations>"]
}

CONSTRAINTS:
- The "word" MUST contain the target kanji exactly as given
- Word vocabulary must match the JLPT level (N5 = beginner everyday vocab, N4 = elementary, N3 = intermediate)
- Prefer common, useful vocabulary actual learners encounter
- DO NOT duplicate or vary slightly from words in the "Existing words" list
- "kanjiReading" must be the actual reading of the target kanji within "word" — katakana for on-yomi, hiragana for kun-yomi
- For mixed/special readings, use whichever style fits the reading type best
- "meaningsKo": 1-3 short Korean translations. ONLY Korean (Hangul / digits / 월·일 etc.). Never include the Japanese word, English, or romaji. Order from most common to least.`;

export type GenerateWordInput = {
  kanjiChar: string;
  level: string;
  existingWords?: { word: string; wordReading: string }[];
};

export type GenerateWordOutput = {
  word: string;
  wordReading: string;
  kanjiReading: string;
  meaningsKo: string[];
};

function isWordOutput(x: unknown): x is GenerateWordOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.word === "string" &&
    typeof o.wordReading === "string" &&
    typeof o.kanjiReading === "string" &&
    Array.isArray(o.meaningsKo) &&
    o.meaningsKo.every((m) => typeof m === "string")
  );
}

export async function generateWord(
  input: GenerateWordInput,
  tier: Tier = "default",
): Promise<{ result: GenerateWordOutput; modelUsed: string; usage: Usage }> {
  const userMessage = [
    `Target kanji: ${input.kanjiChar}`,
    `JLPT Level: ${input.level}`,
    input.existingWords && input.existingWords.length > 0
      ? `\nExisting words (DO NOT duplicate or vary slightly):\n${input.existingWords.map((w) => `- ${w.word} (${w.wordReading})`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return withFallback<GenerateWordOutput>(
    tier,
    isWordOutput,
    (resolved, model) =>
      callJson(resolved, model, WORD_SYSTEM_PROMPT, userMessage, WORD_SCHEMA),
    "word",
  );
}

// ─── generateExplanation ────────────────────────────────────────────────────

const EXPLANATION_SCHEMA = {
  type: "object",
  properties: {
    reasoning: { type: "string" },
    mnemonic: { type: "string" },
  },
  required: ["reasoning", "mnemonic"],
  additionalProperties: false,
} as const;

const EXPLANATION_SYSTEM_PROMPT = `You are a Japanese language tutor for Korean speakers studying JLPT.

Given a Japanese word, its reading, and the focus kanji being studied, explain (IN KOREAN) why the word has this specific reading. Identify which phenomenon applies and explain naturally.

Phenomena to recognize and use the proper Korean term:
- 음편화 (おんびん, sound euphony) — sokuon (っ), nasal change (ん). e.g. 学校(がっこう): ガク+コウ → 促音便
- 연탁 (れんだく, rendaku) — voicing of the second element's initial consonant in compounds. e.g. 手紙(てがみ): て+かみ→がみ
- 연성 (れんじょう, sandhi) — adding ん/m after kanji ending in n/ti. e.g. 観音(かんのん)
- 아테지 (あてじ, ateji) — kanji used purely phonetically, ignoring meaning. e.g. 寿司(すし)
- 숙자훈 (じゅくじくん, jukujikun) — special whole-word reading not derivable from individual kanji. e.g. 今日(きょう), 大人(おとな)
- 그냥 음독 / 훈독 — straightforward on-yomi or kun-yomi with no special change

Output JSON:
{
  "reasoning": "<2-3 sentences in Korean. Identify the phenomenon (use the Japanese term + Korean), explain how the reading was formed.>",
  "mnemonic": "<1-2 sentences in Korean. A vivid, concrete memory tip linking the kanji's meaning/image to the reading sound. Avoid generic advice.>"
}

CONSTRAINTS:
- Korean explanation, but Japanese terms are fine when natural (음편화, 연탁, etc.)
- Be specific: cite the actual kanji and how its reading shifted
- For straightforward readings without sound change, briefly say which reading (음독/훈독) and why it was chosen here
- The mnemonic should be specific to THIS word, not a generic study tip
- Skip sycophancy, praise, and meta-commentary about Korean language`;

export type GenerateExplanationInput = {
  word: string;
  wordReading: string;
  kanjiChar: string;
  level: string;
};

export type GenerateExplanationOutput = {
  reasoning: string;
  mnemonic: string;
};

function isExplanationOutput(x: unknown): x is GenerateExplanationOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.reasoning === "string" && typeof o.mnemonic === "string";
}

export async function generateExplanation(
  input: GenerateExplanationInput,
  tier: Tier = "default",
): Promise<{
  result: GenerateExplanationOutput;
  modelUsed: string;
  usage: Usage;
}> {
  const userMessage = [
    `Word: ${input.word}`,
    `Reading: ${input.wordReading}`,
    `Focus kanji: ${input.kanjiChar}`,
    `JLPT Level: ${input.level}`,
  ].join("\n");

  return withFallback<GenerateExplanationOutput>(
    tier,
    isExplanationOutput,
    (resolved, model) =>
      callJson(
        resolved,
        model,
        EXPLANATION_SYSTEM_PROMPT,
        userMessage,
        EXPLANATION_SCHEMA,
      ),
    "explanation",
  );
}

// ─── generateMeaning + Readings (combined; replaces kanjipedia scraping) ────

const READINGS_SCHEMA = {
  type: "object",
  properties: {
    on: { type: "array", items: { type: "string" } },
    kun: { type: "array", items: { type: "string" } },
    meaningKo: { type: "string" },
  },
  required: ["on", "kun", "meaningKo"],
  additionalProperties: false,
} as const;

const READINGS_SYSTEM_PROMPT = `You generate kanji readings + Korean meaning for JLPT learners.

For a given kanji, return:
- "on":  array of common 音読み (on-yomi) in KATAKANA. e.g. 日 → ["ニチ", "ジツ"]. Order: most common first. Empty array if none.
- "kun": array of common 訓読み (kun-yomi) in HIRAGANA, WITHOUT okurigana parens. e.g. 食 → ["た", "く"], 大 → ["おお"]. Empty array if none.
- "meaningKo": Korean reading-translation in the format "<훈독> <음독> — <부가 의미>".
  - 훈독: native Korean meaning word (날, 한, 메, 큰, 줄, …)
  - 음독: Korean Hanja reading (일, 산, 대, 여, …)
  - 부가 의미 (optional): 1-3 short extra senses, comma-separated
  - Output ONLY Korean (Hangul). Never reuse the kanji or English.

Examples:
- 日 → { "on": ["ニチ","ジツ"], "kun": ["ひ","か"], "meaningKo": "날 일 — 해, 날, 일본" }
- 一 → { "on": ["イチ","イツ"], "kun": ["ひと","ひとつ"], "meaningKo": "한 일 — 하나" }
- 山 → { "on": ["サン"], "kun": ["やま"], "meaningKo": "메 산" }
- 与 → { "on": ["ヨ"], "kun": ["あた","くみ"], "meaningKo": "줄 여 — 주다, 베풀다" }

CONSTRAINTS:
- Return only standard, taught readings. Skip rare/obsolete unless they're educationally important.
- meaningKo MUST follow the "훈독 음독 — 부가" format with em-dash (—).
- Limit to 5 on-readings and 5 kun-readings each.`;

export type GenerateReadingsInput = {
  kanjiChar: string;
};

export type GenerateReadingsOutput = {
  on: string[];
  kun: string[];
  meaningKo: string;
};

function isReadingsOutput(x: unknown): x is GenerateReadingsOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    Array.isArray(o.on) &&
    o.on.every((s) => typeof s === "string") &&
    Array.isArray(o.kun) &&
    o.kun.every((s) => typeof s === "string") &&
    typeof o.meaningKo === "string" &&
    /[가-힣]/.test(o.meaningKo)
  );
}

export async function generateReadings(
  input: GenerateReadingsInput,
  tier: Tier = "default",
): Promise<{
  result: GenerateReadingsOutput;
  modelUsed: string;
  usage: Usage;
}> {
  const userMessage = `Kanji: ${input.kanjiChar}`;
  return withFallback<GenerateReadingsOutput>(
    tier,
    isReadingsOutput,
    (resolved, model) =>
      callJson(
        resolved,
        model,
        READINGS_SYSTEM_PROMPT,
        userMessage,
        READINGS_SCHEMA,
      ),
    "readings",
  );
}

// Legacy generateMeaning kept as a thin wrapper for any caller that only
// wants the meaning without re-fetching readings.
export type GenerateMeaningInput = { kanjiChar: string; hint?: string };
export type GenerateMeaningOutput = { meaningKo: string };

export async function generateMeaning(
  input: GenerateMeaningInput,
  tier: Tier = "default",
): Promise<{ result: GenerateMeaningOutput; modelUsed: string; usage: Usage }> {
  const r = await generateReadings({ kanjiChar: input.kanjiChar }, tier);
  return {
    result: { meaningKo: r.result.meaningKo },
    modelUsed: r.modelUsed,
    usage: r.usage,
  };
}

// ─── generateExampleExplanation ─────────────────────────────────────────────

const EXAMPLE_EXPLANATION_SCHEMA = {
  type: "object",
  properties: {
    nuance: { type: "string" },
    grammar: { type: "string" },
    pronunciation: { type: "string" },
    takeaways: { type: "string" },
  },
  required: ["nuance", "grammar", "pronunciation", "takeaways"],
  additionalProperties: false,
} as const;

const EXAMPLE_EXPLANATION_SYSTEM_PROMPT = `You are a Japanese language tutor for Korean speakers studying JLPT. Given a Japanese example sentence with its Korean translation, explain (IN KOREAN) the whole sentence — not just one word — across four lenses.

Output JSON with these four fields, ALL written in Korean (Japanese terms in original kana/kanji are fine):

{
  "nuance": "<2-4 sentences. Explain Japanese expressions and nuances that don't map 1:1 to Korean. Where the Korean translation simplifies or shifts meaning, say what's actually happening in the Japanese. Cite specific words/particles in 「」 quotes.>",
  "grammar": "<2-4 sentences. Break down notable grammar: particles (は/が/を/に/で/と/から/まで/の/も/や/か), verb forms (て-form, た-form, 〜ている, 〜ます, 〜ない, conditional, passive, causative), adjective inflections, copula, sentence-final particles. Pick the 1-3 most instructive points; don't list everything.>",
  "pronunciation": "<1-3 sentences. ONLY if the sentence has interesting reading phenomena: 연탁(rendaku), 음편화(sokuon/onbin), 숙자훈(jukujikun), 아테지, irregular kanji readings, or non-obvious pitch. If nothing notable, write '특이사항 없음.'>",
  "takeaways": "<2-3 sentences. Idioms, useful patterns, common collocations, JLPT-relevant expressions to memorize. Be concrete with what to learn.>"
}

CONSTRAINTS:
- Korean explanation throughout; quote Japanese in 「」 when citing.
- Be specific to THIS sentence — no generic study advice.
- Skip sycophancy and meta-commentary.
- If a section truly has nothing useful, say so briefly (don't pad).
- The "focus word" is the quiz target inside the sentence — you can mention it but don't repeat the word-level explanation; explain the SENTENCE.`;

export type GenerateExampleExplanationInput = {
  sentence: string;
  translationKo: string;
  focusWord: string;
  focusWordReading: string;
  level: string;
};

export type GenerateExampleExplanationOutput = {
  nuance: string;
  grammar: string;
  pronunciation: string;
  takeaways: string;
};

function isExampleExplanationOutput(
  x: unknown,
): x is GenerateExampleExplanationOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.nuance === "string" &&
    typeof o.grammar === "string" &&
    typeof o.pronunciation === "string" &&
    typeof o.takeaways === "string"
  );
}

export async function generateExampleExplanation(
  input: GenerateExampleExplanationInput,
  tier: Tier = "default",
): Promise<{
  result: GenerateExampleExplanationOutput;
  modelUsed: string;
  usage: Usage;
}> {
  const userMessage = [
    `Sentence (Japanese, plain): ${input.sentence}`,
    `Translation (Korean): ${input.translationKo}`,
    `Focus word: ${input.focusWord} (${input.focusWordReading})`,
    `JLPT Level: ${input.level}`,
  ].join("\n");

  return withFallback<GenerateExampleExplanationOutput>(
    tier,
    isExampleExplanationOutput,
    (resolved, model) =>
      callJson(
        resolved,
        model,
        EXAMPLE_EXPLANATION_SYSTEM_PROMPT,
        userMessage,
        EXAMPLE_EXPLANATION_SCHEMA,
      ),
    "example-explanation",
  );
}

// ─── generateGrammarItemExplanation ─────────────────────────────────────────

const GRAMMAR_ITEM_EXPLANATION_SCHEMA = {
  type: "object",
  properties: {
    whenToUse: { type: "string" },
    comparison: { type: "string" },
    commonMistakes: { type: "string" },
    takeaways: { type: "string" },
  },
  required: ["whenToUse", "comparison", "commonMistakes", "takeaways"],
  additionalProperties: false,
} as const;

const GRAMMAR_ITEM_EXPLANATION_SYSTEM_PROMPT = `You are a Japanese grammar tutor for Korean speakers studying JLPT. Given a Japanese grammar pattern with its short Korean meanings and a basic explanation, write a deeper explanation IN KOREAN — beyond what the basic explanation already says.

Output JSON with these four fields, ALL written in Korean (Japanese terms in original kana/kanji are fine):

{
  "whenToUse": "<2-4 sentences. Concrete situations: who says it, in what register (정중/반말/문어/구어), what topic. Give 1-2 quick scene examples in 「」 quotes if helpful.>",
  "comparison": "<2-4 sentences. Compare with similar/easily-confused patterns (e.g. 「ばかり」 vs 「だけ」, 「は」 vs 「が」). Cite specific patterns with 「」. If no clear comparison exists, write '비교할 만한 표현 없음.'>",
  "commonMistakes": "<2-4 sentences. Typical learner errors: wrong particle, wrong form, wrong context. Give a concrete '✗ wrong → ✓ right' if useful.>",
  "takeaways": "<2-3 sentences. Memorable JLPT-relevant points to lock in. Concrete and actionable, not generic study advice.>"
}

CONSTRAINTS:
- Korean explanation throughout; quote Japanese in 「」 when citing.
- Don't repeat the basic explanation verbatim — go DEEPER.
- Skip sycophancy and meta-commentary.
- If a section has truly nothing to add, say so briefly (don't pad).`;

export type GenerateGrammarItemExplanationInput = {
  pattern: string;
  meaningsKo: string[];
  /** the existing short explanation (don't repeat). */
  baseExplanation: string;
  formation: string | null;
  level: string;
};

export type GenerateGrammarItemExplanationOutput = {
  whenToUse: string;
  comparison: string;
  commonMistakes: string;
  takeaways: string;
};

function isGrammarItemExplanationOutput(
  x: unknown,
): x is GenerateGrammarItemExplanationOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.whenToUse === "string" &&
    typeof o.comparison === "string" &&
    typeof o.commonMistakes === "string" &&
    typeof o.takeaways === "string"
  );
}

export async function generateGrammarItemExplanation(
  input: GenerateGrammarItemExplanationInput,
  tier: Tier = "default",
): Promise<{
  result: GenerateGrammarItemExplanationOutput;
  modelUsed: string;
  usage: Usage;
}> {
  const userMessage = [
    `Pattern: ${input.pattern}`,
    `Korean meanings: ${input.meaningsKo.join(", ")}`,
    `JLPT Level: ${input.level}`,
    input.formation ? `Formation: ${input.formation}` : null,
    `Base explanation (DO NOT repeat — go deeper):\n${input.baseExplanation}`,
  ]
    .filter(Boolean)
    .join("\n");

  return withFallback<GenerateGrammarItemExplanationOutput>(
    tier,
    isGrammarItemExplanationOutput,
    (resolved, model) =>
      callJson(
        resolved,
        model,
        GRAMMAR_ITEM_EXPLANATION_SYSTEM_PROMPT,
        userMessage,
        GRAMMAR_ITEM_EXPLANATION_SCHEMA,
      ),
    "grammar-item-explanation",
  );
}

// ─── generateGrammarExampleExplanation ──────────────────────────────────────

const GRAMMAR_EXAMPLE_EXPLANATION_SYSTEM_PROMPT = `You are a Japanese grammar tutor for Korean speakers studying JLPT. Given a Japanese example sentence (which uses a specific grammar pattern) with its Korean translation, explain (IN KOREAN) the whole sentence across four lenses.

Output JSON with these four fields, ALL written in Korean:

{
  "nuance": "<2-4 sentences. Japanese expressions and nuances that don't map 1:1 to Korean. Where the Korean translation simplifies, what's actually happening in the Japanese. Cite specific words/particles in 「」.>",
  "grammar": "<2-4 sentences. Break down notable grammar with focus on how the target pattern is used here. Particles, verb forms, conditional/passive/causative if present. 1-3 most instructive points.>",
  "pronunciation": "<1-3 sentences. ONLY if the sentence has interesting reading phenomena: 연탁, 음편화, 숙자훈, 아테지, irregular kanji readings. Otherwise '특이사항 없음.'>",
  "takeaways": "<2-3 sentences. Idioms, useful patterns, JLPT-relevant memorables. Concrete.>"
}

CONSTRAINTS:
- Korean throughout; quote Japanese in 「」.
- Be specific to THIS sentence — no generic advice.
- The "focus pattern" is the grammar form being studied — explain how it's used here, but explain the whole SENTENCE, not just the pattern.
- Skip sycophancy.`;

export type GenerateGrammarExampleExplanationInput = {
  sentence: string;
  translationKo: string;
  pattern: string;
  patternMeaning: string;
  level: string;
};

export type GenerateGrammarExampleExplanationOutput = {
  nuance: string;
  grammar: string;
  pronunciation: string;
  takeaways: string;
};

function isGrammarExampleExplanationOutput(
  x: unknown,
): x is GenerateGrammarExampleExplanationOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.nuance === "string" &&
    typeof o.grammar === "string" &&
    typeof o.pronunciation === "string" &&
    typeof o.takeaways === "string"
  );
}

export async function generateGrammarExampleExplanation(
  input: GenerateGrammarExampleExplanationInput,
  tier: Tier = "default",
): Promise<{
  result: GenerateGrammarExampleExplanationOutput;
  modelUsed: string;
  usage: Usage;
}> {
  const userMessage = [
    `Sentence (Japanese): ${input.sentence}`,
    `Translation (Korean): ${input.translationKo}`,
    `Focus grammar pattern: ${input.pattern} (${input.patternMeaning})`,
    `JLPT Level: ${input.level}`,
  ].join("\n");

  return withFallback<GenerateGrammarExampleExplanationOutput>(
    tier,
    isGrammarExampleExplanationOutput,
    (resolved, model) =>
      callJson(
        resolved,
        model,
        GRAMMAR_EXAMPLE_EXPLANATION_SYSTEM_PROMPT,
        userMessage,
        EXAMPLE_EXPLANATION_SCHEMA,
      ),
    "grammar-example-explanation",
  );
}

// ─── generateGrammarQuizExplanation ─────────────────────────────────────────

const GRAMMAR_QUIZ_EXPLANATION_SCHEMA = {
  type: "object",
  properties: {
    promptAnalysis: { type: "string" },
    correctAnswer: { type: "string" },
    whyCorrect: { type: "string" },
    whyOthersWrong: { type: "string" },
  },
  required: ["promptAnalysis", "correctAnswer", "whyCorrect", "whyOthersWrong"],
  additionalProperties: false,
} as const;

const GRAMMAR_QUIZ_EXPLANATION_SYSTEM_PROMPT = `You are a Japanese grammar tutor for Korean speakers studying JLPT. Given a multiple-choice grammar quiz with its correct answer and distractors, explain (IN KOREAN) why the answer is correct and the distractors aren't.

Output JSON with these four fields, ALL written in Korean:

{
  "promptAnalysis": "<2-4 sentences. Analyze the prompt/example sentence: what it means, what's being tested, what the structure reveals. If a blank, what slot is being filled. Cite Japanese in 「」.>",
  "correctAnswer": "<1 sentence. Restate the correct answer clearly with the Japanese form quoted in 「」 and a brief Korean gloss.>",
  "whyCorrect": "<2-3 sentences. Why this answer fits — particle role / verb form / pattern semantics — pointing to the specific reason it works here.>",
  "whyOthersWrong": "<2-4 sentences. Brief reasons each wrong choice fails. Use ✗ markers + 「Japanese」 form. Combine if multiple share the same kind of error.>"
}

CONSTRAINTS:
- Korean throughout; quote Japanese in 「」.
- Be specific to THIS quiz — concrete, not generic.
- 'whyOthersWrong' should help the learner avoid that exact mistake next time.
- Skip sycophancy.`;

export type GenerateGrammarQuizExplanationInput = {
  /** "conjugation" | "particle_blank" | "pattern_blank" | "form_meaning" | "ko_to_jp_form" */
  quizType: string;
  /** Plain-text representation of the question (assembled by caller). */
  promptText: string;
  /** Plain-text correct answer. */
  answer: string;
  /** Plain-text distractors. */
  distractors: string[];
  /** Grammar pattern this quiz is testing. */
  pattern: string;
  patternMeaning: string;
  level: string;
};

export type GenerateGrammarQuizExplanationOutput = {
  promptAnalysis: string;
  correctAnswer: string;
  whyCorrect: string;
  whyOthersWrong: string;
};

function isGrammarQuizExplanationOutput(
  x: unknown,
): x is GenerateGrammarQuizExplanationOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.promptAnalysis === "string" &&
    typeof o.correctAnswer === "string" &&
    typeof o.whyCorrect === "string" &&
    typeof o.whyOthersWrong === "string"
  );
}

export async function generateGrammarQuizExplanation(
  input: GenerateGrammarQuizExplanationInput,
  tier: Tier = "default",
): Promise<{
  result: GenerateGrammarQuizExplanationOutput;
  modelUsed: string;
  usage: Usage;
}> {
  const userMessage = [
    `Grammar pattern: ${input.pattern} (${input.patternMeaning})`,
    `JLPT Level: ${input.level}`,
    `Quiz type: ${input.quizType}`,
    `Prompt:\n${input.promptText}`,
    `Correct answer: ${input.answer}`,
    `Distractors:`,
    ...input.distractors.map((d) => `  - ${d}`),
  ].join("\n");

  return withFallback<GenerateGrammarQuizExplanationOutput>(
    tier,
    isGrammarQuizExplanationOutput,
    (resolved, model) =>
      callJson(
        resolved,
        model,
        GRAMMAR_QUIZ_EXPLANATION_SYSTEM_PROMPT,
        userMessage,
        GRAMMAR_QUIZ_EXPLANATION_SCHEMA,
      ),
    "grammar-quiz-explanation",
  );
}

// ─── generateGrammarUsageGuide ──────────────────────────────────────────────

const GRAMMAR_USAGE_GUIDE_SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          rule: { type: "string" },
          examples: {
            type: "array",
            items: {
              type: "object",
              properties: {
                jp: { type: "string" },
                jpReading: { type: ["string", "null"] },
                conjugated: { type: ["string", "null"] },
                gloss: { type: "string" },
              },
              required: ["jp", "gloss"],
              additionalProperties: false,
            },
          },
          note: { type: ["string", "null"] },
        },
        required: ["title", "rule", "examples"],
        additionalProperties: false,
      },
    },
  },
  required: ["intro", "sections"],
  additionalProperties: false,
} as const;

const GRAMMAR_USAGE_GUIDE_SYSTEM_PROMPT = `You are a Japanese grammar tutor for Korean speakers studying JLPT. Given a Japanese grammar pattern, produce a structured "usage guide" — sections + examples — IN KOREAN.

Output JSON:
{
  "intro": "<한 줄 개요. 이 패턴이 어떤 종류의 문법인지 간결하게.>",
  "sections": [
    {
      "title": "<섹션 제목 (한국어). 예: '1그룹 (5단 동사)' / '장소' / 'から과의 차이' / '동사 활용 규칙' 등>",
      "rule": "<섹션의 핵심 규칙·의미 1-3 문장 (한국어).>",
      "examples": [
        {
          "jp": "<일본어 예. 한자에는 {kanji|hiragana} 형태로 ruby (선택), {{}} target 마커는 사용 X.>",
          "jpReading": "<선택. jp 의 전체 가나 발음 또는 로마자. jp 에 ruby 가 모든 한자에 있으면 null.>",
          "conjugated": "<선택. 그룹별 활용처럼 사전형 → 변형 결과 매핑일 때만. 일반 예문이면 null.>",
          "gloss": "<한국어 뜻>"
        }
      ],
      "note": "<선택. 예외·주의·tip. 없으면 null.>"
    }
  ]
}

SECTION 구성 가이드 (패턴 유형별):

A) **그룹별 변형** (verb_form 의 활용형, 형용사 활용 등)
   - sections: "1그룹 (5단)", "2그룹 (1단)", "3그룹 (불규칙)", "예외 1그룹" 등
   - 각 examples 에 dictForm + conjugated 매핑 (jp = 사전형, conjugated = 변형 결과, gloss = 한국어)

B) **다의·다용도** (조사·접속사·종조사 의 여러 용법)
   - sections: 의미별로 ("장소", "수단", "이유", "시간" 등)
   - examples 는 각 용법의 자연스러운 예문 (전체 문장)

C) **비교·대조** (비슷한 표현과의 차이)
   - sections: "기본 의미", "X 와의 차이", "Y 와의 차이"
   - examples 에 비교군의 같은 상황 예문을 나란히 배치 (자매 항목과 비교 가능하게)

D) **활용·접속 규칙** (たい, たがる 같이 어디 붙는지가 중요)
   - sections: "동사·형용사 활용", "사용 제한", "응용"
   - examples 에 어떻게 결합되는지 보여줌

E) **격식·문체 매핑** (존경·겸양어)
   - sections: "일반 → 존경", "활용", "사용 상황"
   - examples 에 일반 표현 ↔ 존경 표현 대응

F) **단순 부사·감탄** (의미 1개 + 풍부한 예)
   - sections 1-2개로 충분. "기본 사용" + 필요시 "뉘앙스/유의어"

CONSTRAINTS:
- Korean throughout (Japanese in 「」 또는 jp 필드).
- Sections 갯수: 보통 2-5개 (단순 패턴은 1-2개도 OK).
- 각 section 에 examples 2-5개.
- 패턴이 단순하면 sections 적게. 복잡하면 풍부하게.
- 예문은 JLPT 레벨에 맞는 자연스러운 일본어.
- {{}} target 마커는 절대 사용 X (이건 퀴즈 markup, 가이드는 일반 ruby 만).
- Skip sycophancy.`;

export type GenerateGrammarUsageGuideInput = {
  pattern: string;
  meaningsKo: string[];
  baseExplanation: string;
  formation: string | null;
  category: string;
  level: string;
  /** 룰 family ID — 있으면 prompt 가 다르게 작동 (foundation/derived). */
  ruleFamily?: string | null;
  /** family 의 기초 항목인지. true 면 그룹별 변형 풀 가이드. */
  isFoundation?: boolean;
  /** 같은 family 의 foundation 항목 pattern (derived 일 때 참조용). */
  foundationPattern?: string | null;
  /**
   * 보조 family 의 foundation patterns (배열). 이 패턴이 다른 활용 형태도
   * 받을 때 prompt 에 "추가로 X·Y 형태도 받음" 부가 언급용.
   */
  relatedFoundationPatterns?: string[];
};

export type GenerateGrammarUsageGuideOutput = {
  intro: string;
  sections: Array<{
    title: string;
    rule: string;
    examples: Array<{
      jp: string;
      jpReading?: string | null;
      conjugated?: string | null;
      gloss: string;
    }>;
    note?: string | null;
  }>;
};

function isGrammarUsageGuideOutput(
  x: unknown,
): x is GenerateGrammarUsageGuideOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.intro !== "string") return false;
  if (!Array.isArray(o.sections)) return false;
  for (const s of o.sections as Array<Record<string, unknown>>) {
    if (typeof s.title !== "string" || typeof s.rule !== "string") return false;
    if (!Array.isArray(s.examples)) return false;
    for (const ex of s.examples as Array<Record<string, unknown>>) {
      if (typeof ex.jp !== "string" || typeof ex.gloss !== "string")
        return false;
    }
  }
  return true;
}

export async function generateGrammarUsageGuide(
  input: GenerateGrammarUsageGuideInput,
  tier: Tier = "default",
): Promise<{
  result: GenerateGrammarUsageGuideOutput;
  modelUsed: string;
  usage: Usage;
}> {
  const relatedHint =
    (input.relatedFoundationPatterns?.length ?? 0) > 0
      ? `\n또한 이 패턴은 다음 형태도 받을 수 있습니다: ${input.relatedFoundationPatterns!.map((p) => `"${p}"`).join(", ")}. 첫 section 에서 가볍게 언급해 주세요 — 각 형태가 어떤 뉘앙스를 만드는지 (있으면).`
      : "";

  const familyHint =
    input.isFoundation === true
      ? `\n[FOUNDATION ITEM] 이 항목은 "${input.ruleFamily}" family 의 기초입니다. 그룹별/형태별 변형 규칙을 풀로 (1그룹/2그룹/3그룹 또는 현재/과거/부정/과거부정 등) 풍부하게 출력하세요. 이 항목이 변형 규칙의 reference 역할.`
      : input.ruleFamily
        ? `\n[DERIVED ITEM] 이 항목은 "${input.ruleFamily}" family 에 속하지만 기초가 아닙니다. 변형 규칙은 ${input.foundationPattern ? `"${input.foundationPattern}"` : "기초 항목"}와 동일하므로 **반복하지 마세요**. 첫 section 에서 "활용 규칙은 ${input.foundationPattern ?? "기초 항목"}과 동일" 정도로 짧게 언급하고, 의미·용법·뉘앙스·비교에 집중하세요.${relatedHint}`
        : "";

  const userMessage = [
    `Pattern: ${input.pattern}`,
    `Korean meanings: ${input.meaningsKo.join(", ")}`,
    `Category: ${input.category}`,
    `JLPT Level: ${input.level}`,
    input.formation ? `Formation: ${input.formation}` : null,
    `Base explanation: ${input.baseExplanation}`,
    familyHint || null,
  ]
    .filter(Boolean)
    .join("\n");

  return withFallback<GenerateGrammarUsageGuideOutput>(
    tier,
    isGrammarUsageGuideOutput,
    (resolved, model) =>
      callJson(
        resolved,
        model,
        GRAMMAR_USAGE_GUIDE_SYSTEM_PROMPT,
        userMessage,
        GRAMMAR_USAGE_GUIDE_SCHEMA,
        6000,
      ),
    "grammar-usage-guide",
  );
}

// ─── generateGrammarExample ─────────────────────────────────────────────────

const GRAMMAR_EXAMPLE_SCHEMA = {
  type: "object",
  properties: {
    sentence: { type: "string" },
    sentenceTranslationKo: { type: "string" },
    note: { type: ["string", "null"] },
  },
  required: ["sentence", "sentenceTranslationKo"],
  additionalProperties: false,
} as const;

const GRAMMAR_EXAMPLE_SYSTEM_PROMPT = `You are a Japanese grammar example-sentence generator for Korean speakers studying JLPT.

Produce ONE natural Japanese example sentence that uses the given grammar pattern, plus a Korean translation.

OUTPUT — JSON with these fields:
- "sentence": the Japanese sentence in inline-markup form (rules below)
- "sentenceTranslationKo": natural Korean translation
- "note" (optional): a short Korean note about the sentence (1 short clause). Use null if nothing notable.

INLINE MARKUP for "sentence":
- Wrap the grammar form's USE in the sentence as {{...}} EXACTLY ONCE — this is the target.
- Wrap EVERY other kanji segment as {kanji|hiragana} — reading must match how it's actually pronounced.
- Hiragana, katakana, particles, punctuation appear as plain text.
- ⚠ {{...}} CANNOT contain ruby. If the target needs to include a kanji whose reading is not obvious, prefer "split-target": keep the kanji with ruby OUTSIDE {{}} and wrap only the kana suffix. e.g. "{走|はし}{{っちゃいけない}}" instead of "{{走っちゃいけない}}".

Examples:
- pattern "〜たい" → "{学校|がっこう}に{行|い}き{{たい}}です。"
- pattern "ちゃいけない・じゃいけない" → "ここで{走|はし}{{っちゃいけない}}よ。"
- pattern "だけ" → "{今日|きょう}は{水|みず}{{だけ}}{飲|の}みます。"

CONSTRAINTS:
- Vocabulary appropriate for the JLPT level given.
- Exactly one {{...}} target marker.
- Every non-target kanji has {kanji|hiragana}.
- {{...}} CANNOT contain ruby — split target if needed.
- Sentence ends with appropriate punctuation (。, ？, etc).
- DO NOT reuse a sentence from the "existing" list — the new one must be different in structure or vocabulary.
- Keep it short and natural (5–15 어절).`;

export type GenerateGrammarExampleInput = {
  pattern: string;
  meaningKo: string;
  formation: string | null;
  level: string;
  /** 기존 예문들 — 중복 회피용. */
  existingSentences: string[];
};

export type GenerateGrammarExampleOutput = {
  sentence: string;
  sentenceTranslationKo: string;
  note?: string | null;
};

function isGrammarExampleOutput(x: unknown): x is GenerateGrammarExampleOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.sentence === "string" &&
    typeof o.sentenceTranslationKo === "string"
  );
}

export async function generateGrammarExample(
  input: GenerateGrammarExampleInput,
  tier: Tier = "default",
): Promise<{
  result: GenerateGrammarExampleOutput;
  modelUsed: string;
  usage: Usage;
}> {
  const userMessage = [
    `Pattern: ${input.pattern}`,
    `Korean meaning: ${input.meaningKo}`,
    input.formation ? `Formation: ${input.formation}` : null,
    `JLPT Level: ${input.level}`,
    input.existingSentences.length > 0
      ? `Existing sentences (do NOT repeat any of these):\n${input.existingSentences.map((s) => `  - ${s}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return withFallback<GenerateGrammarExampleOutput>(
    tier,
    isGrammarExampleOutput,
    (resolved, model) =>
      callJson(
        resolved,
        model,
        GRAMMAR_EXAMPLE_SYSTEM_PROMPT,
        userMessage,
        GRAMMAR_EXAMPLE_SCHEMA,
      ),
    "grammar-example",
  );
}

// ─── generateGrammarQuiz (2-stage) ──────────────────────────────────────────
// 1) 적용 가능 type 중에서 가장 적절한 type 선택 (작은 호출).
// 2) 정해진 type 의 specific schema 로 payload 생성.
//
// 단일 union schema 는 Anthropic 의 "additionalProperties: false" 제약 + JSON
// schema 의 oneOf 지원 부족 때문에 안 통함. 2단계로 분리해서 schema 를 type 별로 구체화.

const ALL_QUIZ_TYPES = [
  "conjugation",
  "particle_blank",
  "pattern_blank",
  "form_meaning",
  "ko_to_jp_form",
] as const;

// ─── Stage 1 schema: type 결정 ──────────────────────────────────────────────

function makeQuizTypePickSchema(applicable: string[]): Schema {
  return {
    type: "object",
    properties: {
      chosenType: { type: "string", enum: applicable },
    },
    required: ["chosenType"],
    additionalProperties: false,
  };
}

const QUIZ_TYPE_PICK_SYSTEM_PROMPT = `You are a Japanese grammar quiz designer.

Given a pattern and the list of existing quizzes, pick the BEST quiz type to add.

Selection criteria:
- Avoid duplicating the type that's already most-used in existing quizzes (variety).
- Pick a type that fits the pattern naturally:
  - "conjugation" — when the pattern itself involves verb/adjective form transformation
  - "particle_blank" — particles (は/が/を/に/で/から…)
  - "pattern_blank" — connective/expressive patterns
  - "form_meaning" — testing recognition of a form's Korean meaning
  - "ko_to_jp_form" — testing translation Korean→Japanese using the pattern
- Output: { "chosenType": <one of the applicable types> }`;

// ─── Stage 2 schemas: type 별 payload + 외부 wrapper ─────────────────────────

const CONJUGATION_PAYLOAD_SCHEMA: Schema = {
  type: "object",
  properties: {
    dictForm: { type: "string" },
    group: {
      type: "string",
      enum: ["godan", "ichidan", "irregular", "i_adj", "na_adj", "noun", "any"],
    },
    targetFormLabel: { type: "string" },
    answer: { type: "string" },
    distractors: {
      type: "array",
      items: { type: "string" },
    },
    hintKo: { type: ["string", "null"] },
  },
  required: ["dictForm", "group", "targetFormLabel", "answer", "distractors"],
  additionalProperties: false,
};

const BLANK_PAYLOAD_SCHEMA: Schema = {
  type: "object",
  properties: {
    sentence: { type: "string" },
    answer: { type: "string" },
    distractors: {
      type: "array",
      items: { type: "string" },
    },
    translationKo: { type: "string" },
  },
  required: ["sentence", "answer", "distractors", "translationKo"],
  additionalProperties: false,
};

const FORM_MEANING_PAYLOAD_SCHEMA: Schema = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    contextSentence: { type: ["string", "null"] },
    answer: { type: "string" },
    distractors: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["prompt", "answer", "distractors"],
  additionalProperties: false,
};

const KO_TO_JP_PAYLOAD_SCHEMA: Schema = {
  type: "object",
  properties: {
    ko: { type: "string" },
    answer: { type: "string" },
    distractors: {
      type: "array",
      items: { type: "string" },
    },
    hintKo: { type: ["string", "null"] },
  },
  required: ["ko", "answer", "distractors"],
  additionalProperties: false,
};

const PAYLOAD_SCHEMA_BY_TYPE: Record<string, Schema> = {
  conjugation: CONJUGATION_PAYLOAD_SCHEMA,
  particle_blank: BLANK_PAYLOAD_SCHEMA,
  pattern_blank: BLANK_PAYLOAD_SCHEMA,
  form_meaning: FORM_MEANING_PAYLOAD_SCHEMA,
  ko_to_jp_form: KO_TO_JP_PAYLOAD_SCHEMA,
};

const PAYLOAD_GUIDE_BY_TYPE: Record<string, string> = {
  conjugation: `Type "conjugation" — payload:
{
  "dictForm": "<dictionary form, JP, e.g. 食べる>",
  "group": "godan|ichidan|irregular|i_adj|na_adj|noun|any",
  "targetFormLabel": "<Korean label, e.g. 'ます형' / 'たい형' / '과거형'>",
  "answer": "<correct conjugated form>",
  "distractors": ["<wrong1>", "<wrong2>", "<wrong3>"],
  "hintKo": "<Korean hint or null>"
}
- Distractors are common conjugation mistakes (wrong group, wrong tense, wrong活用 step).`,
  particle_blank: `Type "particle_blank" — payload:
{
  "sentence": "<inline-markup sentence with ONE {{X}} target where X = the answer particle>",
  "answer": "<X — must equal what's inside {{...}}>",
  "distractors": ["<other particle>", "<other>", "<other>"],
  "translationKo": "<KO translation of full sentence>"
}
- {{}} cannot contain ruby — particle is hiragana so no issue.
- Distractors are other particles (に/を/で/が/と/から…).`,
  pattern_blank: `Type "pattern_blank" — payload:
{
  "sentence": "<inline-markup sentence with ONE {{X}} target where X = the answer pattern>",
  "answer": "<X — must equal what's inside {{...}}>",
  "distractors": ["<similar pattern>", "<similar>", "<similar>"],
  "translationKo": "<KO translation>"
}
- {{}} CANNOT contain ruby — if pattern includes kanji, prefer kana spelling.
- Distractors are similar but wrong patterns (other conjunctions/expressions).`,
  form_meaning: `Type "form_meaning" — payload:
{
  "prompt": "<short Japanese form, may include {kanji|reading} ruby; do NOT use {{}}>",
  "contextSentence": "<optional inline-markup sentence or null>",
  "answer": "<Korean meaning, PLAIN text — no markup>",
  "distractors": ["<KO>", "<KO>", "<KO>"]
}
- answer/distractors are plain Korean.
- Distractors are common confusable Korean meanings.`,
  ko_to_jp_form: `Type "ko_to_jp_form" — payload:
{
  "ko": "<Korean sentence>",
  "answer": "<Japanese sentence with ruby + ONE {{...}} marking pattern usage>",
  "distractors": ["<wrong JP with one {{...}}>", "<wrong>", "<wrong>"],
  "hintKo": "<Korean hint or null>"
}
- All four JP sentences must have ruby on every non-target kanji and exactly one {{...}}.
- {{}} cannot contain ruby (split target if needed).
- Distractors apply the pattern incorrectly (wrong particle / wrong tense / wrong activation).`,
};

const QUIZ_PAYLOAD_SYSTEM_PROMPT = `You are a Japanese grammar quiz generator for Korean speakers studying JLPT.

Generate ONE high-quality multiple-choice quiz of the SPECIFIED type. Output JSON with the exact payload shape — no extra fields.

INLINE MARKUP RULES (when sentence-form fields are used):
- {{...}} target appears EXACTLY ONCE per sentence.
- {{...}} CANNOT contain ruby — if kanji must be inside, prefer split-target: keep kanji+ruby OUTSIDE {{}} and only the suffix inside.
- Every non-target kanji must have {kanji|hiragana} ruby.

QUALITY RULES:
- distractors 배열은 EXACTLY 3 strings — not 2, not 4, exactly 3. Plausible mistakes (wrong particle, wrong activation, wrong tense).
- Distractors must NOT equal the answer.
- Vocabulary appropriate for the given JLPT level.
- DO NOT duplicate any quiz in the "Existing quizzes" list.
- Stay strictly within the requested type's payload shape.`;

export type GenerateGrammarQuizInput = {
  pattern: string;
  meaningKo: string;
  formation: string | null;
  level: string;
  /** 적용 가능한 퀴즈 타입들. */
  applicableQuizTypes: string[];
  /**
   * 기존 퀴즈 (중복 회피용).
   * `variation` 은 type 별 식별 필드 (conjugation: dictForm+label, blank: sentence,
   * form_meaning: prompt, ko_to_jp_form: ko). 같은 type+variation 조합은 절대 생성 X.
   */
  existingQuizzes: Array<{ type: string; answer: string; variation: string }>;
};

export type GenerateGrammarQuizOutput = {
  type: string;
  payload: Record<string, unknown>;
};

function isQuizTypePickOutput(
  x: unknown,
): x is { chosenType: string } {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.chosenType === "string";
}

function makePayloadValidator(
  type: string,
): (x: unknown) => x is Record<string, unknown> {
  return (x): x is Record<string, unknown> => {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    // 모든 type 공통: distractors 정확히 3개 + 모두 string
    const distractorsOk =
      Array.isArray(o.distractors) &&
      o.distractors.length === 3 &&
      o.distractors.every((d) => typeof d === "string");
    if (!distractorsOk) return false;

    if (type === "conjugation") {
      return (
        typeof o.dictForm === "string" &&
        typeof o.group === "string" &&
        typeof o.targetFormLabel === "string" &&
        typeof o.answer === "string"
      );
    }
    if (type === "particle_blank" || type === "pattern_blank") {
      return (
        typeof o.sentence === "string" &&
        typeof o.answer === "string" &&
        typeof o.translationKo === "string"
      );
    }
    if (type === "form_meaning") {
      return typeof o.prompt === "string" && typeof o.answer === "string";
    }
    if (type === "ko_to_jp_form") {
      return typeof o.ko === "string" && typeof o.answer === "string";
    }
    return false;
  };
}

export async function generateGrammarQuiz(
  input: GenerateGrammarQuizInput,
  tier: Tier = "default",
): Promise<{
  result: GenerateGrammarQuizOutput;
  modelUsed: string;
  usage: Usage;
}> {
  // 적용 가능 타입 안전성 체크
  const applicable = input.applicableQuizTypes.filter((t) =>
    (ALL_QUIZ_TYPES as readonly string[]).includes(t),
  );
  if (applicable.length === 0) {
    throw new Error("no valid applicableQuizTypes");
  }

  const baseUserMessage = [
    `Pattern: ${input.pattern}`,
    `Korean meaning: ${input.meaningKo}`,
    input.formation ? `Formation: ${input.formation}` : null,
    `JLPT Level: ${input.level}`,
    `Applicable quiz types: ${applicable.join(", ")}`,
    input.existingQuizzes.length > 0
      ? `Existing quizzes — do NOT duplicate (variation field is what makes a quiz unique within a type):
- conjugation: variation = dictForm + targetFormLabel (different verb / different target form = OK)
- particle_blank/pattern_blank: variation = sentence (different sentence = OK)
- form_meaning: variation = prompt (different prompt = OK)
- ko_to_jp_form: variation = ko (different Korean prompt = OK)

Existing list:
${input.existingQuizzes
  .map((q) => `  - ${q.type}: variation="${q.variation}" (answer="${q.answer}")`)
  .join("\n")}

If you generate a new ${input.existingQuizzes.length > 0 ? "" : ""}quiz of the same type, choose a DIFFERENT variation. For example, if existing has 'particle_blank' with sentence "学校へ行きます。", generate a different sentence.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  let aggUsage: Usage = ZERO_USAGE;
  let modelUsed = "";

  // ── Stage 1: chosenType ──
  let chosenType: string;
  if (applicable.length === 1) {
    // 분기 1개면 stage 1 skip — 절약.
    chosenType = applicable[0];
  } else {
    const pick = await withFallback<{ chosenType: string }>(
      tier,
      isQuizTypePickOutput,
      (resolved, model) =>
        callJson(
          resolved,
          model,
          QUIZ_TYPE_PICK_SYSTEM_PROMPT,
          baseUserMessage,
          makeQuizTypePickSchema(applicable),
        ),
      "grammar-quiz-pick",
    );
    if (!applicable.includes(pick.result.chosenType)) {
      throw new Error(
        `AI picked non-applicable type "${pick.result.chosenType}"`,
      );
    }
    chosenType = pick.result.chosenType;
    aggUsage = addUsage(aggUsage, pick.usage);
    modelUsed = pick.modelUsed;
  }

  // ── Stage 2: payload for chosenType ──
  const payloadSchema = PAYLOAD_SCHEMA_BY_TYPE[chosenType];
  if (!payloadSchema) {
    throw new Error(`no payload schema for type "${chosenType}"`);
  }
  const stage2UserMessage = [
    `Quiz type: ${chosenType}`,
    PAYLOAD_GUIDE_BY_TYPE[chosenType],
    "",
    baseUserMessage,
  ].join("\n");

  const validatePayload = makePayloadValidator(chosenType);
  const stage2 = await withFallback<Record<string, unknown>>(
    tier,
    validatePayload,
    (resolved, model) =>
      callJson(
        resolved,
        model,
        QUIZ_PAYLOAD_SYSTEM_PROMPT,
        stage2UserMessage,
        payloadSchema,
      ),
    `grammar-quiz-payload:${chosenType}`,
  );
  aggUsage = addUsage(aggUsage, stage2.usage);
  modelUsed = stage2.modelUsed;

  return {
    result: { type: chosenType, payload: stage2.result },
    modelUsed,
    usage: aggUsage,
  };
}
