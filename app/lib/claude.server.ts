import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

export type Tier = "default" | "premium";

/**
 * Provider selection: prefer Anthropic when ANTHROPIC_API_KEY is set,
 * otherwise fall back to Gemini. Enables running the app on a Gemini-only
 * quota (e.g. free Google AI Studio).
 */
const USE_GEMINI = !process.env.ANTHROPIC_API_KEY;

const DEFAULT_MODEL = USE_GEMINI
  ? (process.env.GEMINI_DEFAULT_MODEL ?? "gemini-3.1-flash-lite")
  : (process.env.ANTHROPIC_DEFAULT_MODEL ?? "claude-haiku-4-5");
const PREMIUM_MODEL = USE_GEMINI
  ? (process.env.GEMINI_PREMIUM_MODEL ?? "gemini-3-flash-preview")
  : (process.env.ANTHROPIC_PREMIUM_MODEL ?? "claude-sonnet-4-6");

// Models that accept `output_config.effort` on Anthropic. Haiku 4.5 returns
// 400 when given effort, so we omit it for Haiku. Gemini ignores this entirely.
const SUPPORTS_EFFORT = new Set([
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-sonnet-4-6",
]);

let _anthropicClient: Anthropic | null = null;
function anthropicClient() {
  if (_anthropicClient) return _anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  _anthropicClient = new Anthropic({ apiKey });
  return _anthropicClient;
}

let _geminiClient: GoogleGenAI | null = null;
function geminiClient() {
  if (_geminiClient) return _geminiClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  _geminiClient = new GoogleGenAI({ apiKey });
  return _geminiClient;
}

function modelFor(tier: Tier) {
  return tier === "premium" ? PREMIUM_MODEL : DEFAULT_MODEL;
}

type Schema = Record<string, unknown>;

/**
 * Strip JSON-Schema fields Gemini rejects (e.g. `additionalProperties`),
 * recursively. The remaining shape (`type`, `properties`, `required`,
 * `items`) is compatible with Gemini's `responseSchema`.
 */
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

async function callAnthropic(
  model: string,
  systemPrompt: string,
  userMessage: string,
  schema: Schema,
): Promise<{ data: unknown; usage: Usage }> {
  const outputConfig: Record<string, unknown> = {
    format: { type: "json_schema", schema },
  };
  if (SUPPORTS_EFFORT.has(model)) outputConfig.effort = "low";

  const response = await anthropicClient().messages.create({
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
  model: string,
  systemPrompt: string,
  userMessage: string,
  schema: Schema,
): Promise<{ data: unknown; usage: Usage }> {
  const response = await geminiClient().models.generateContent({
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
  model: string,
  systemPrompt: string,
  userMessage: string,
  schema: Schema,
): Promise<{ data: unknown; usage: Usage }> {
  if (USE_GEMINI) {
    return callGemini(model, systemPrompt, userMessage, schema);
  }
  return callAnthropic(model, systemPrompt, userMessage, schema);
}

/**
 * Run a Claude call with one-step model fallback.
 * - tier="default": try Haiku, on ANY error retry once with Sonnet
 * - tier="premium": call Sonnet directly (no fallback)
 *
 * Returns the result plus the model that ultimately produced it.
 */
async function withFallback<T>(
  tier: Tier,
  validate: (out: unknown) => out is T,
  call: (model: string) => Promise<{ data: unknown; usage: Usage }>,
  label: string,
): Promise<{ result: T; modelUsed: string; usage: Usage }> {
  const primary = modelFor(tier);
  let lastErr: unknown = null;
  let aggregated: Usage = ZERO_USAGE;

  try {
    const { data, usage } = await call(primary);
    aggregated = addUsage(aggregated, usage);
    if (validate(data))
      return { result: data, modelUsed: primary, usage: aggregated };
    lastErr = new Error("validation failed");
    console.warn(`[claude:${label}] ${primary} produced invalid output:`, data);
  } catch (err) {
    lastErr = err;
    console.warn(`[claude:${label}] ${primary} threw:`, err);
  }

  if (tier === "default" && primary !== PREMIUM_MODEL) {
    try {
      const { data, usage } = await call(PREMIUM_MODEL);
      aggregated = addUsage(aggregated, usage);
      if (validate(data)) {
        console.warn(
          `[claude:${label}] fell back to ${PREMIUM_MODEL} successfully`,
        );
        return { result: data, modelUsed: PREMIUM_MODEL, usage: aggregated };
      }
      lastErr = new Error("fallback validation failed");
      console.error(
        `[claude:${label}] ${PREMIUM_MODEL} fallback also produced invalid output:`,
        data,
      );
    } catch (err) {
      lastErr = err;
      console.error(`[claude:${label}] ${PREMIUM_MODEL} fallback threw:`, err);
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
    (model) => callJson(model, EXAMPLE_SYSTEM_PROMPT, userMessage, EXAMPLE_SCHEMA),
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
  },
  required: ["word", "wordReading", "kanjiReading"],
  additionalProperties: false,
} as const;

const WORD_SYSTEM_PROMPT = `You are a Japanese vocabulary generator for Korean JLPT learners.

Given a target kanji and JLPT level, output ONE Japanese word that contains the target kanji. Return JSON:
{
  "word": "<word containing the target kanji, e.g. 学校>",
  "wordReading": "<full hiragana reading of the word, e.g. がっこう>",
  "kanjiReading": "<reading of the TARGET KANJI within this word — KATAKANA for on-yomi (音読み), HIRAGANA for kun-yomi (訓読み)>"
}

Examples:
- target 一: { "word": "一月", "wordReading": "いちがつ", "kanjiReading": "イチ" }
- target 一: { "word": "一つ", "wordReading": "ひとつ", "kanjiReading": "ひとつ" }
- target 学: { "word": "学校", "wordReading": "がっこう", "kanjiReading": "ガク" }
- target 山: { "word": "富士山", "wordReading": "ふじさん", "kanjiReading": "サン" }

CONSTRAINTS:
- The "word" MUST contain the target kanji exactly as given
- Word vocabulary must match the JLPT level (N5 = beginner everyday vocab, N4 = elementary, N3 = intermediate)
- Prefer common, useful vocabulary actual learners encounter
- DO NOT duplicate or vary slightly from words in the "Existing words" list
- "kanjiReading" must be the actual reading of the target kanji within "word" — katakana for on-yomi, hiragana for kun-yomi
- For mixed/special readings, use whichever style fits the reading type best`;

export type GenerateWordInput = {
  kanjiChar: string;
  level: string;
  existingWords?: { word: string; wordReading: string }[];
};

export type GenerateWordOutput = {
  word: string;
  wordReading: string;
  kanjiReading: string;
};

function isWordOutput(x: unknown): x is GenerateWordOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.word === "string" &&
    typeof o.wordReading === "string" &&
    typeof o.kanjiReading === "string"
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
    (model) => callJson(model, WORD_SYSTEM_PROMPT, userMessage, WORD_SCHEMA),
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
): Promise<{ result: GenerateExplanationOutput; modelUsed: string; usage: Usage }> {
  const userMessage = [
    `Word: ${input.word}`,
    `Reading: ${input.wordReading}`,
    `Focus kanji: ${input.kanjiChar}`,
    `JLPT Level: ${input.level}`,
  ].join("\n");

  return withFallback<GenerateExplanationOutput>(
    tier,
    isExplanationOutput,
    (model) =>
      callJson(model, EXPLANATION_SYSTEM_PROMPT, userMessage, EXPLANATION_SCHEMA),
    "explanation",
  );
}

// ─── generateMeaning ────────────────────────────────────────────────────────

const MEANING_SCHEMA = {
  type: "object",
  properties: {
    meaningKo: { type: "string" },
  },
  required: ["meaningKo"],
  additionalProperties: false,
} as const;

const MEANING_SYSTEM_PROMPT = `You translate kanji into the standard Korean reading-translation for JLPT learners.

For a kanji, return the Korean kanji reading-translation in the format:
  "<훈독> <음독> — <부가 의미>"

Rules:
- 훈독 (native Korean): the core Korean meaning word (e.g. 날, 한, 메, 나무, 큰).
- 음독 (Sino-Korean reading, 한자음): the Korean Hanja reading (e.g. 일, 산, 목, 대).
- 부가 의미 (optional): 1-3 short extra senses separated by commas, only if useful.
  If only one or two main meanings, the dash and 부가 can be omitted.
- Output only Korean (Hangul), never reuse the kanji or English.
- For abstract kanji where 훈독 doesn't fit cleanly, use a natural Korean noun.

Examples:
- 日 → "날 일 — 해, 날, 일본"
- 一 → "한 일 — 하나"
- 山 → "메 산"
- 与 → "줄 여 — 주다, 베풀다"
- 経 → "지날 경 — 경전, 경과"

Return JSON: { "meaningKo": "<korean>" }`;

export type GenerateMeaningInput = {
  kanjiChar: string;
  hint?: string;
};

export type GenerateMeaningOutput = {
  meaningKo: string;
};

function isMeaningOutput(x: unknown): x is GenerateMeaningOutput {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.meaningKo === "string" && /[가-힣]/.test(o.meaningKo);
}

export async function generateMeaning(
  input: GenerateMeaningInput,
  tier: Tier = "default",
): Promise<{ result: GenerateMeaningOutput; modelUsed: string; usage: Usage }> {
  const userMessage = [
    `Kanji: ${input.kanjiChar}`,
    input.hint ? `Hint (existing meaning or English): ${input.hint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return withFallback<GenerateMeaningOutput>(
    tier,
    isMeaningOutput,
    (model) => callJson(model, MEANING_SYSTEM_PROMPT, userMessage, MEANING_SCHEMA),
    "meaning",
  );
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
    (model) =>
      callJson(
        model,
        EXAMPLE_EXPLANATION_SYSTEM_PROMPT,
        userMessage,
        EXAMPLE_EXPLANATION_SCHEMA,
      ),
    "example-explanation",
  );
}
