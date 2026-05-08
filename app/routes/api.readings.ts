import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.readings";
import { db, kanji as kanjiTable, readings as readingsTable } from "~/lib/db";
import { fetchKanjiReadings } from "~/lib/kanjipedia.server";
import { generateMeaning, type Usage } from "~/lib/claude.server";

export function loader() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }
  const body = (await request.json().catch(() => null)) as {
    kanjiId?: number;
  } | null;
  const kanjiId = Number(body?.kanjiId);
  if (!Number.isFinite(kanjiId)) {
    return Response.json({ error: "kanjiId required" }, { status: 400 });
  }

  const target = await db.query.kanji.findFirst({
    where: eq(kanjiTable.id, kanjiId),
  });
  if (!target) {
    return Response.json({ error: "kanji not found" }, { status: 404 });
  }

  let fetched;
  try {
    fetched = await fetchKanjiReadings(target.character);
  } catch (err) {
    console.error("[api.readings] fetch failed:", err);
    const message = err instanceof Error ? err.message : "fetch failed";
    return Response.json({ error: message }, { status: 502 });
  }

  // Replace readings for this kanji. words.readingId has onDelete:set null,
  // so existing word→reading associations become null (acceptable trade-off).
  await db.delete(readingsTable).where(eq(readingsTable.kanjiId, kanjiId));

  const rows = [
    ...fetched.on.map((reading) => ({
      kanjiId,
      type: "on" as const,
      reading,
    })),
    ...fetched.kun.map((reading) => ({
      kanjiId,
      type: "kun" as const,
      reading,
    })),
  ];

  if (rows.length === 0) {
    return Response.json(
      { error: "no readings extracted" },
      { status: 502 },
    );
  }

  const inserted = await db.insert(readingsTable).values(rows).returning();

  let meaningKo: string | null = null;
  let meaningModel: string | null = null;
  let meaningUsage: Usage | null = null;
  try {
    const gen = await generateMeaning({
      kanjiChar: target.character,
      hint: target.meaningKo,
    });
    meaningKo = gen.result.meaningKo;
    meaningModel = gen.modelUsed;
    meaningUsage = gen.usage;
    await db
      .update(kanjiTable)
      .set({ meaningKo: gen.result.meaningKo })
      .where(eq(kanjiTable.id, kanjiId));
  } catch (err) {
    console.warn("[api.readings] meaning regeneration failed:", err);
  }

  return Response.json({
    on: fetched.on,
    kun: fetched.kun,
    detailUrl: fetched.detailUrl,
    count: inserted.length,
    meaningKo,
    meaningModel,
    usage:
      meaningUsage && meaningModel
        ? { ...meaningUsage, model: meaningModel }
        : null,
  });
}
