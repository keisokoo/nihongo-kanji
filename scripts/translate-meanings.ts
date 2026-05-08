import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
dotenv.config({ override: true });
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_DEFAULT_MODEL ?? "claude-haiku-4-5";
const BATCH_SIZE = 40;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM_PROMPT = `You translate kanji English meanings into Korean for JLPT learners.

For each kanji + its English meanings, return the standard Korean kanji reading-translation in the format:
  "<훈독> <음독> — <부가 의미>"

Rules:
- 훈독 (native Korean): the core Korean meaning word (e.g. 날, 한, 메, 나무, 큰).
- 음독 (Sino-Korean reading, 한자음): the Korean Hanja reading (e.g. 일, 산, 목, 대).
- 부가 의미 (optional): 1-3 short extra senses separated by commas, only if useful.
  If only one or two main meanings, the dash and 부가 can be omitted.
- Output only Korean (Hangul), never reuse the kanji or English.
- For abstract kanji where 훈독 doesn't fit cleanly, use a natural Korean noun.

Examples:
- 日 (Japan, counter for days, day, sun)  → "날 일 — 해, 날, 일본"
- 一 (one, 1)                             → "한 일 — 하나"
- 山 (mountain)                           → "메 산"
- 与 (award, bestow, cause, gift, give)   → "줄 여 — 주다, 베풀다"
- 経 (sutras, longitude, pass through)    → "지날 경 — 경전, 경과"

Return JSON: { "items": [ { "char": "<kanji>", "meaningKo": "<korean>" }, ... ] }
Same length and order as input.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          char: { type: "string" },
          meaningKo: { type: "string" },
        },
        required: ["char", "meaningKo"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

type Item = { char: string; english: string };

async function translateBatch(
  batch: Item[],
): Promise<Map<string, string>> {
  const userMessage =
    `Translate these ${batch.length} kanji to Korean (한자 형식):\n\n` +
    batch
      .map(
        (it, i) =>
          `${i + 1}. ${it.char} (${it.english})`,
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
    items: { char: string; meaningKo: string }[];
  };
  const map = new Map<string, string>();
  for (const it of parsed.items) {
    map.set(it.char, it.meaningKo);
  }
  return map;
}

function isKorean(s: string): boolean {
  return /[가-힣]/.test(s);
}

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

async function main() {
  const dataDir = resolve(process.cwd(), "scripts/data");

  // Collect all kanji that need translation across all levels.
  const need: Array<{ level: string; idx: number; char: string; english: string }> = [];
  const fileCache: Record<string, any> = {};
  for (const level of LEVELS) {
    const path = `${dataDir}/${level.toLowerCase()}.json`;
    const data = JSON.parse(await readFile(path, "utf-8"));
    fileCache[level] = data;
    for (let i = 0; i < data.kanji.length; i++) {
      const k = data.kanji[i];
      if (!isKorean(k.meaningKo)) {
        need.push({
          level,
          idx: i,
          char: k.character,
          english: k.meaningKo,
        });
      }
    }
  }
  console.log(`need to translate: ${need.length} kanji`);
  if (need.length === 0) {
    console.log("nothing to do");
    return;
  }

  // Batch + call
  const allTranslations = new Map<string, string>();
  let processed = 0;
  const start = Date.now();

  for (let off = 0; off < need.length; off += BATCH_SIZE) {
    const batch = need.slice(off, off + BATCH_SIZE);
    let attempt = 0;
    while (attempt < 3) {
      try {
        const result = await translateBatch(
          batch.map((b) => ({ char: b.char, english: b.english })),
        );
        // Validate every batched char got a translation
        const missing = batch.filter((b) => !result.has(b.char));
        if (missing.length > 0) {
          console.warn(
            `  batch missing ${missing.length} (chars: ${missing.map((m) => m.char).join(",")}) — retry`,
          );
          attempt++;
          if (attempt >= 3) {
            // Save what we got, mark missing
            for (const [c, v] of result) allTranslations.set(c, v);
          }
          continue;
        }
        for (const [c, v] of result) allTranslations.set(c, v);
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

  // Apply translations back to each level's JSON
  let updated = 0;
  let skipped = 0;
  for (const item of need) {
    const ko = allTranslations.get(item.char);
    if (!ko || !isKorean(ko)) {
      skipped++;
      continue;
    }
    fileCache[item.level].kanji[item.idx].meaningKo = ko;
    updated++;
  }

  // Write back
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
