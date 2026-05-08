import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.explanation";
import { db, words as wordsTable } from "~/lib/db";
import { generateExplanation, type Tier } from "~/lib/claude.server";

export function loader() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }
  const body = (await request.json().catch(() => null)) as {
    wordId?: number;
    tier?: Tier;
  } | null;
  const wordId = Number(body?.wordId);
  if (!Number.isFinite(wordId)) {
    return Response.json({ error: "wordId required" }, { status: 400 });
  }
  const tier: Tier = body?.tier === "premium" ? "premium" : "default";

  const word = await db.query.words.findFirst({
    where: eq(wordsTable.id, wordId),
    with: { kanji: true },
  });
  if (!word) {
    return Response.json({ error: "word not found" }, { status: 404 });
  }

  // Cache: return existing explanation unless premium tier (regenerate).
  if (tier !== "premium" && word.explanation) {
    return Response.json({
      explanation: word.explanation,
      cached: true,
    });
  }

  let gen;
  try {
    gen = await generateExplanation(
      {
        word: word.word,
        wordReading: word.wordReading,
        kanjiChar: word.kanji.character,
        level: word.kanji.packKey,
      },
      tier,
    );
  } catch (err) {
    console.error("[api.explanation] generation failed:", err);
    const message = err instanceof Error ? err.message : "generation failed";
    return Response.json({ error: message }, { status: 502 });
  }

  const explanation = {
    reasoning: gen.result.reasoning,
    mnemonic: gen.result.mnemonic,
    modelUsed: gen.modelUsed,
    createdAt: new Date().toISOString(),
  };

  await db
    .update(wordsTable)
    .set({ explanation })
    .where(eq(wordsTable.id, wordId));

  return Response.json({ explanation, cached: false });
}
