import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
dotenv.config({ override: true });
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_DEFAULT_MODEL ?? "claude-haiku-4-5";
const BATCH_SIZE = 30;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM_PROMPT = `You translate Japanese words into 1-3 short Korean meanings for JLPT learners.

Input: a list of Japanese words with their hiragana reading and the focus kanji.
Output: for each word, return an array of 1-3 SHORT Korean meanings (most-common first).

Rules:
- Korean Hangul / digits / 월·일·년 etc. only. Never include Japanese, English, or romaji.
- Keep each meaning concise — typically 1-3 syllables. e.g. ["학교"], ["크다", "큰"], ["1월"], ["가다"], ["먹다"].
- Numbers / dates: write Korean form. 一月 → ["1월"], 二日 → ["이틀", "2일"], 三人 → ["세 명", "3명"].
- Verbs: dictionary-form Korean (-다). 食べる → ["먹다"]. Don't include -습니다 forms.
- Adjectives: -다 form + optional adnominal. 大きい → ["크다", "큰"].
- Counters: include the unit. 三本 → ["세 자루", "3자루"]. 五匹 → ["다섯 마리"].
- For names / proper nouns, transliterate. 富士山 → ["후지산"]. 日本 → ["일본"].
- For abstract sense, prefer the main JLPT-textbook gloss.

Return JSON: { "items": [ { "word": "<japanese>", "meaningsKo": ["..."] }, ... ] }
Same length and order as input.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          meaningsKo: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["word", "meaningsKo"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

type Item = {
  word: string;
  wordReading: string;
  kanjiChar: string;
};

async function translateBatch(
  batch: Item[],
): Promise<Map<string, string[]>> {
  const userMessage =
    `Translate these ${batch.length} Japanese words to Korean:\n\n` +
    batch
      .map(
        (it, i) =>
          `${i + 1}. ${it.word} (${it.wordReading}) — focus kanji: ${it.kanjiChar}`,
      )
      .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: SCHEMA },
    } as never,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("no text in response");
  }
  const parsed = JSON.parse(text.text) as {
    items: { word: string; meaningsKo: string[] }[];
  };
  const map = new Map<string, string[]>();
  for (const it of parsed.items) {
    map.set(it.word, it.meaningsKo);
  }
  return map;
}

function isAllKorean(arr: string[]): boolean {
  if (arr.length === 0) return false;
  // Reject if any meaning contains hiragana, katakana, or kanji.
  return arr.every((s) => {
    if (!s.trim()) return false;
    return !/[぀-ヿ一-鿿]/.test(s);
  });
}

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

async function main() {
  const dataDir = resolve(process.cwd(), "scripts/data");

  // Collect all words missing or with empty meaningsKo across all levels.
  type Need = {
    level: string;
    kanjiIdx: number;
    wordIdx: number;
    word: string;
    wordReading: string;
    kanjiChar: string;
  };
  const need: Need[] = [];
  const fileCache: Record<string, any> = {};

  for (const level of LEVELS) {
    const path = `${dataDir}/${level.toLowerCase()}.json`;
    const data = JSON.parse(await readFile(path, "utf-8"));
    fileCache[level] = data;
    for (let ki = 0; ki < data.kanji.length; ki++) {
      const k = data.kanji[ki];
      const words = k.words ?? [];
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi];
        const m = w.meaningsKo;
        if (!Array.isArray(m) || m.length === 0) {
          need.push({
            level,
            kanjiIdx: ki,
            wordIdx: wi,
            word: w.word,
            wordReading: w.wordReading,
            kanjiChar: k.character,
          });
        }
      }
    }
  }

  console.log(`words needing translation: ${need.length}`);
  if (need.length === 0) {
    console.log("nothing to do");
    return;
  }

  // Batch + call
  const allTranslations = new Map<string, string[]>();
  let processed = 0;
  const start = Date.now();

  for (let off = 0; off < need.length; off += BATCH_SIZE) {
    const batch = need.slice(off, off + BATCH_SIZE);
    let attempt = 0;
    while (attempt < 3) {
      try {
        const result = await translateBatch(
          batch.map((b) => ({
            word: b.word,
            wordReading: b.wordReading,
            kanjiChar: b.kanjiChar,
          })),
        );
        const missing = batch.filter((b) => !result.has(b.word));
        if (missing.length > 0) {
          console.warn(
            `  batch missing ${missing.length} (${missing.map((m) => m.word).join(",")}) — retry`,
          );
          attempt++;
          if (attempt >= 3) {
            for (const [w, m] of result) allTranslations.set(w, m);
          }
          continue;
        }
        for (const [w, m] of result) allTranslations.set(w, m);
        break;
      } catch (err) {
        attempt++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  batch error (attempt ${attempt}): ${msg}`);
        if (attempt >= 3) {
          console.error(`  giving up on batch ${off}-${off + batch.length}`);
        }
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    processed += batch.length;
    const elapsed = (Date.now() - start) / 1000;
    const rate = processed / elapsed;
    const remain = (need.length - processed) / rate;
    console.log(
      `  ${processed}/${need.length} (${rate.toFixed(1)}/s, eta ${remain.toFixed(0)}s)`,
    );
  }

  // Apply back to files
  let updated = 0;
  let skipped = 0;
  for (const item of need) {
    const m = allTranslations.get(item.word);
    if (!m || m.length === 0 || !isAllKorean(m)) {
      skipped++;
      continue;
    }
    fileCache[item.level].kanji[item.kanjiIdx].words[item.wordIdx].meaningsKo =
      m;
    updated++;
  }

  for (const level of LEVELS) {
    const path = `${dataDir}/${level.toLowerCase()}.json`;
    await writeFile(
      path,
      JSON.stringify(fileCache[level], null, 2) + "\n",
      "utf-8",
    );
  }

  console.log(
    `\ndone: ${updated} updated, ${skipped} skipped (in ${((Date.now() - start) / 1000).toFixed(1)}s)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
