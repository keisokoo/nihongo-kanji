import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.word";
import {
  db,
  kanji as kanjiTable,
  readings as readingsTable,
  words as wordsTable,
} from "~/lib/db";
import { generateWord, type Tier } from "~/lib/claude.server";

export function loader() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }
  const body = (await request.json().catch(() => null)) as {
    kanjiId?: number;
    tier?: Tier;
  } | null;
  const kanjiId = Number(body?.kanjiId);
  if (!Number.isFinite(kanjiId)) {
    return Response.json({ error: "kanjiId required" }, { status: 400 });
  }
  const tier: Tier = body?.tier === "premium" ? "premium" : "default";

  const target = await db.query.kanji.findFirst({
    where: eq(kanjiTable.id, kanjiId),
    with: { readings: true, words: true },
  });
  if (!target) {
    return Response.json({ error: "kanji not found" }, { status: 404 });
  }

  const existingByText = new Set(
    target.words.map((w) => `${w.word}|${w.wordReading}`),
  );

  let attempt = 0;
  const MAX_ATTEMPTS = 2;
  let lastError: string | null = null;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    let gen;
    try {
      gen = await generateWord(
        {
          kanjiChar: target.character,
          level: target.packKey,
          existingWords: target.words.map((w) => ({
            word: w.word,
            wordReading: w.wordReading,
          })),
        },
        tier,
      );
    } catch (err) {
      lastError = err instanceof Error ? err.message : "generation failed";
      console.error("[api.word] generation failed:", err);
      break;
    }

    const { word, wordReading, kanjiReading } = gen.result;

    if (!word.includes(target.character)) {
      lastError = `generated word "${word}" does not contain ${target.character}`;
      console.warn("[api.word]", lastError);
      continue;
    }
    if (existingByText.has(`${word}|${wordReading}`)) {
      lastError = `generated word "${word}" already exists`;
      console.warn("[api.word]", lastError);
      continue;
    }

    // Match kanjiReading to one of the kanji's readings (best-effort).
    const matchedReading = target.readings.find(
      (r) => r.reading === kanjiReading,
    );

    const [saved] = await db
      .insert(wordsTable)
      .values({
        kanjiId: target.id,
        readingId: matchedReading?.id ?? null,
        word,
        wordReading,
        source: "generated",
      })
      .returning();

    return Response.json({
      word: saved,
      kanjiReading,
      matched: !!matchedReading,
      modelUsed: gen.modelUsed,
    });
  }

  return Response.json(
    { error: lastError ?? "failed to generate a valid word" },
    { status: 502 },
  );
}
