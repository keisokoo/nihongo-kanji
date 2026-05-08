import { redirect } from "react-router";
import { asc, eq } from "drizzle-orm";
import type { Route } from "./+types/study-index";
import { db, kanji as kanjiTable, packs as packsTable } from "~/lib/db";

export async function loader({ params }: Route.LoaderArgs) {
  const packKey = params.level; // URL segment is the pack key (kept named "level" for back-compat)
  const pack = await db.query.packs.findFirst({
    where: eq(packsTable.key, packKey),
  });
  if (!pack) throw redirect("/");

  const first = await db.query.kanji.findFirst({
    where: eq(kanjiTable.packKey, pack.key),
    orderBy: asc(kanjiTable.id),
    columns: { id: true },
  });

  if (!first) throw redirect("/");
  throw redirect(`/study/${encodeURIComponent(pack.key)}/${first.id}`);
}

export default function StudyIndex() {
  return null;
}
