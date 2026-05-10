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

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  schema: Schema,
): Promise<{ data: unknown; usage: Usage }> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const outputConfig: Record<string, unknown> = {
    format: { type: "json_schema", schema },
  };
  if (SUPPORTS_EFFORT.has(model)) outputConfig.effort = "low";

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
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
): Promise<{ data: unknown; usage: Usage }> {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: geminiSchema(schema) as never,
      maxOutputTokens: 2048,
    },
  });

  const text = response.text;
  if (!text) {
    console.error("[gemini] no text in response", response);
    throw new Error("Gemini returned no text");
  }

  const meta = response.usageMetadata;
  const usage: Usage = {
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: meta?.cachedContentTokenCount ?? 0,
  };

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
): Promise<{ data: unknown; usage: Usage }> {
  if (resolved.provider === "anthropic") {
    return callAnthropic(
      resolved.anthropicKey!,
      model,
      systemPrompt,
      userMessage,
      schema,
    );
  }
  return callGemini(
    resolved.geminiKey!,
    model,
    systemPrompt,
    userMessage,
    schema,
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
  const primary = tier === "premium" ? resolved.premiumModel : resolved.defaultModel;
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
        console.warn(
          `[claude:${label}] fell back to ${fallback} successfully`,
        );
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
      callJson(resolved, model, EXAMPLE_SYSTEM_PROMPT, userMessage, EXAMPLE_SCHEMA),
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
): Promise<{ result: GenerateReadingsOutput; modelUsed: string; usage: Usage }> {
  const userMessage = `Kanji: ${input.kanjiChar}`;
  return withFallback<GenerateReadingsOutput>(
    tier,
    isReadingsOutput,
    (resolved, model) =>
      callJson(resolved, model, READINGS_SYSTEM_PROMPT, userMessage, READINGS_SCHEMA),
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

// ─── generateGrammarQuiz ─────────────────────────────────────────────────────

const GRAMMAR_QUIZ_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: [
        "conjugation",
        "particle_blank",
        "pattern_blank",
        "form_meaning",
        "ko_to_jp_form",
      ],
    },
    payload: {
      type: "object",
      // payload 형식은 type 별로 다양 — schema 는 헐거운 통합 검증.
      additionalProperties: true,
    },
  },
  required: ["type", "payload"],
  additionalProperties: false,
} as const;

const GRAMMAR_QUIZ_SYSTEM_PROMPT = `You are a Japanese grammar quiz generator for Korean speakers studying JLPT.

Pick ONE of the requested quiz types and produce a quality multiple-choice quiz with 1 correct answer + 3 distractors.

OUTPUT — JSON: { "type": <one of the requested types>, "payload": {...} }

PAYLOAD shapes by type:

1) "conjugation"
{
  "dictForm": "<dictionary form, JP>",
  "group": "godan|ichidan|irregular|i_adj|na_adj|noun|any",
  "targetFormLabel": "<Korean label like 'ます형' or 'たい형'>",
  "answer": "<correct conjugated form>",
  "distractors": ["<wrong>", "<wrong>", "<wrong>"],
  "hintKo": null
}

2) "particle_blank" / "pattern_blank"
{
  "sentence": "<inline-markup sentence with EXACTLY ONE {{X}} target where X = the answer>",
  "answer": "<X — must equal target text>",
  "distractors": ["<wrong>", "<wrong>", "<wrong>"],
  "translationKo": "<KO translation>"
}

3) "form_meaning"
{
  "prompt": "<short Japanese form, may include ruby. {{}} not used>",
  "contextSentence": null,
  "answer": "<Korean meaning, plain>",
  "distractors": ["<KO>", "<KO>", "<KO>"]
}

4) "ko_to_jp_form"
{
  "ko": "<Korean sentence>",
  "answer": "<Japanese sentence with ruby + {{...}} target marking pattern usage>",
  "distractors": ["<wrong JP with {{...}}>", "<wrong>", "<wrong>"],
  "hintKo": null
}

INLINE MARKUP RULES:
- {{...}} target appears EXACTLY ONCE per sentence (when used).
- {{...}} CANNOT contain ruby — if a kanji is needed inside, split-target: keep kanji+ruby outside {{}}.
- Every non-target kanji must have {kanji|hiragana}.

QUALITY RULES:
- Distractors should be plausible mistakes — wrong particle, wrong activation, wrong meaning — not obviously absurd.
- Distractors must NOT equal the answer.
- For 'form_meaning' answer/distractors: plain Korean (no markup).
- For 'ko_to_jp_form' answer/distractors: full JP sentences with markup, each with one {{...}}.
- For 'particle_blank'/'pattern_blank' sentence: {{}} content == answer string.
- Vocabulary appropriate for the given JLPT level.
- DO NOT generate a quiz that duplicates the given existing quizzes (same answer + same type combination).
- Pick a type from "applicableQuizTypes". Avoid picking a type already used too many times if other applicable types are unused.`;

export type GenerateGrammarQuizInput = {
  pattern: string;
  meaningKo: string;
  formation: string | null;
  level: string;
  /** 적용 가능한 퀴즈 타입들. */
  applicableQuizTypes: string[];
  /** 기존 퀴즈 (중복 회피). */
  existingQuizzes: Array<{ type: string; answer: string }>;
};

export type GenerateGrammarQuizOutput = {
  type: string;
  payload: Record<string, unknown>;
};

function isGrammarQuizOutput(x: unknown): x is GenerateGrammarQuizOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.type === "string" &&
    o.payload !== null &&
    typeof o.payload === "object"
  );
}

export async function generateGrammarQuiz(
  input: GenerateGrammarQuizInput,
  tier: Tier = "default",
): Promise<{
  result: GenerateGrammarQuizOutput;
  modelUsed: string;
  usage: Usage;
}> {
  const userMessage = [
    `Pattern: ${input.pattern}`,
    `Korean meaning: ${input.meaningKo}`,
    input.formation ? `Formation: ${input.formation}` : null,
    `JLPT Level: ${input.level}`,
    `Applicable quiz types: ${input.applicableQuizTypes.join(", ")}`,
    input.existingQuizzes.length > 0
      ? `Existing quizzes (do NOT duplicate type+answer):\n${input.existingQuizzes
          .map((q) => `  - ${q.type}: ${q.answer}`)
          .join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return withFallback<GenerateGrammarQuizOutput>(
    tier,
    isGrammarQuizOutput,
    (resolved, model) =>
      callJson(
        resolved,
        model,
        GRAMMAR_QUIZ_SYSTEM_PROMPT,
        userMessage,
        GRAMMAR_QUIZ_SCHEMA,
      ),
    "grammar-quiz",
  );
}
