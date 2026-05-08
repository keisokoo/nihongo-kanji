import Anthropic from "@anthropic-ai/sdk";

export type Tier = "default" | "premium";

const DEFAULT_MODEL =
  process.env.ANTHROPIC_DEFAULT_MODEL ?? "claude-haiku-4-5";
const PREMIUM_MODEL =
  process.env.ANTHROPIC_PREMIUM_MODEL ?? "claude-sonnet-4-6";

// Models that accept `output_config.effort`. Haiku 4.5 returns 400 when given
// effort, so we omit it for Haiku.
const SUPPORTS_EFFORT = new Set([
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-sonnet-4-6",
]);

let _client: Anthropic | null = null;
function client() {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  _client = new Anthropic({ apiKey });
  return _client;
}

function modelFor(tier: Tier) {
  return tier === "premium" ? PREMIUM_MODEL : DEFAULT_MODEL;
}

type Schema = Record<string, unknown>;

async function callJson<T>(
  model: string,
  systemPrompt: string,
  userMessage: string,
  schema: Schema,
): Promise<T> {
  const outputConfig: Record<string, unknown> = {
    format: { type: "json_schema", schema },
  };
  if (SUPPORTS_EFFORT.has(model)) outputConfig.effort = "low";

  const response = await client().messages.create({
    model,
    max_tokens: 1024,
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

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.error("[claude] no text content", response);
    throw new Error("Claude returned no text content");
  }

  try {
    return JSON.parse(textBlock.text) as T;
  } catch {
    console.error("[claude] JSON parse failed:", textBlock.text);
    throw new Error("Claude returned invalid JSON");
  }
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
  call: (model: string) => Promise<unknown>,
  label: string,
): Promise<{ result: T; modelUsed: string }> {
  const primary = modelFor(tier);
  let lastErr: unknown = null;

  try {
    const out = await call(primary);
    if (validate(out)) return { result: out, modelUsed: primary };
    lastErr = new Error("validation failed");
    console.warn(`[claude:${label}] ${primary} produced invalid output:`, out);
  } catch (err) {
    lastErr = err;
    console.warn(`[claude:${label}] ${primary} threw:`, err);
  }

  if (tier === "default" && primary !== PREMIUM_MODEL) {
    try {
      const out = await call(PREMIUM_MODEL);
      if (validate(out)) {
        console.warn(
          `[claude:${label}] fell back to ${PREMIUM_MODEL} successfully`,
        );
        return { result: out, modelUsed: PREMIUM_MODEL };
      }
      lastErr = new Error("fallback validation failed");
      console.error(
        `[claude:${label}] ${PREMIUM_MODEL} fallback also produced invalid output:`,
        out,
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
  level: "N5" | "N4" | "N3";
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
): Promise<{ result: GenerateExampleOutput; modelUsed: string }> {
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
  level: "N5" | "N4" | "N3";
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
): Promise<{ result: GenerateWordOutput; modelUsed: string }> {
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
  level: "N5" | "N4" | "N3";
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
): Promise<{ result: GenerateExplanationOutput; modelUsed: string }> {
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
