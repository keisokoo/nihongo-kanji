import { and, eq, notInArray, sql } from "drizzle-orm";
import type { Route } from "./+types/api.example";
import {
  db,
  examples as examplesTable,
  words as wordsTable,
} from "~/lib/db";
import { parseSentence, tokensToMarkdown } from "~/lib/sentence";
import { generateExample, type Tier } from "~/lib/claude.server";

export function loader() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }
  const body = (await request.json().catch(() => null)) as {
    wordId?: number;
    excludeIds?: number[];
    tier?: Tier;
  } | null;
  const wordId = Number(body?.wordId);
  if (!Number.isFinite(wordId)) {
    return Response.json({ error: "wordId required" }, { status: 400 });
  }
  const excludeIds = Array.isArray(body?.excludeIds)
    ? body!.excludeIds.map(Number).filter((n) => Number.isFinite(n))
    : [];
  const tier: Tier = body?.tier === "premium" ? "premium" : "default";

  const word = await db.query.words.findFirst({
    where: eq(wordsTable.id, wordId),
    with: { kanji: true },
  });
  if (!word) {
    return Response.json({ error: "word not found" }, { status: 404 });
  }

  type ExampleRow = typeof examplesTable.$inferSelect;
  let example: ExampleRow | undefined;
  let cached = false;
  let modelUsed: string | undefined;

  // Premium tier (다시 생성) bypasses cache and always generates fresh.
  if (tier !== "premium") {
    example = await db.query.examples.findFirst({
      where: and(
        eq(examplesTable.wordId, wordId),
        excludeIds.length > 0
          ? notInArray(examplesTable.id, excludeIds)
          : undefined,
      ),
      orderBy: sql`random()`,
    });
    cached = !!example;
  }

  if (!example) {
    const allExamples = await db.query.examples.findMany({
      where: eq(examplesTable.wordId, wordId),
    });
    const existingMd = allExamples.map((e) => tokensToMarkdown(e.sentence));

    let gen;
    try {
      gen = await generateExample(
        {
          word: word.word,
          wordReading: word.wordReading,
          kanjiChar: word.kanji.character,
          level: word.kanji.level,
          excludeSentences: existingMd,
        },
        tier,
      );
    } catch (err) {
      console.error("[api.example] generation failed:", err);
      const message = err instanceof Error ? err.message : "generation failed";
      return Response.json({ error: message }, { status: 502 });
    }
    modelUsed = gen.modelUsed;

    let tokens;
    try {
      tokens = parseSentence(
        gen.result.sentence,
        `generated ${word.word}/${word.wordReading}`,
      );
    } catch (err) {
      console.error(
        "[api.example] generated markup invalid:",
        gen.result.sentence,
        err,
      );
      return Response.json(
        { error: "generated sentence has invalid markup" },
        { status: 502 },
      );
    }

    const targetCount = tokens.filter((t) => t.target).length;
    if (targetCount !== 1) {
      console.error(
        "[api.example] generated sentence has wrong target count:",
        targetCount,
        gen.result.sentence,
      );
      return Response.json(
        { error: "generated sentence missing target marker" },
        { status: 502 },
      );
    }

    const [saved] = await db
      .insert(examplesTable)
      .values({
        wordId,
        sentence: tokens,
        sentenceTranslationKo: gen.result.translationKo,
        source: "generated",
      })
      .returning();
    example = saved;
    cached = false;
  }

  if (!example) {
    return Response.json(
      { error: "failed to obtain example" },
      { status: 500 },
    );
  }

  return Response.json({
    example: {
      id: example.id,
      sentence: example.sentence,
      sentenceTranslationKo: example.sentenceTranslationKo,
      source: example.source,
    },
    cached,
    modelUsed,
  });
}
