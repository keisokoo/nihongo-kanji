import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.example-explanation";
import {
  db,
  examples as examplesTable,
  words as wordsTable,
} from "~/lib/db";
import {
  generateExampleExplanation,
  type Tier,
} from "~/lib/claude.server";
import { tokensToPlain } from "~/lib/sentence";

export function loader() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }
  const body = (await request.json().catch(() => null)) as {
    exampleId?: number;
    tier?: Tier;
  } | null;
  const exampleId = Number(body?.exampleId);
  if (!Number.isFinite(exampleId)) {
    return Response.json({ error: "exampleId required" }, { status: 400 });
  }
  const tier: Tier = body?.tier === "premium" ? "premium" : "default";

  const example = await db.query.examples.findFirst({
    where: eq(examplesTable.id, exampleId),
  });
  if (!example) {
    return Response.json({ error: "example not found" }, { status: 404 });
  }

  if (tier !== "premium" && example.explanation) {
    return Response.json({
      explanation: example.explanation,
      cached: true,
      usage: null,
    });
  }

  const word = await db.query.words.findFirst({
    where: eq(wordsTable.id, example.wordId),
    with: { kanji: true },
  });
  if (!word) {
    return Response.json({ error: "word not found" }, { status: 404 });
  }

  let gen;
  try {
    gen = await generateExampleExplanation(
      {
        sentence: tokensToPlain(example.sentence),
        translationKo: example.sentenceTranslationKo ?? "",
        focusWord: word.word,
        focusWordReading: word.wordReading,
        level: word.kanji.packKey,
      },
      tier,
    );
  } catch (err) {
    console.error("[api.example-explanation] generation failed:", err);
    const message = err instanceof Error ? err.message : "generation failed";
    return Response.json({ error: message }, { status: 502 });
  }

  const explanation = {
    nuance: gen.result.nuance,
    grammar: gen.result.grammar,
    pronunciation: gen.result.pronunciation,
    takeaways: gen.result.takeaways,
    modelUsed: gen.modelUsed,
    createdAt: new Date().toISOString(),
  };

  await db
    .update(examplesTable)
    .set({ explanation })
    .where(eq(examplesTable.id, exampleId));

  return Response.json({
    explanation,
    cached: false,
    usage: { ...gen.usage, model: gen.modelUsed },
  });
}
