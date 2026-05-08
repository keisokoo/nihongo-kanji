import { redirect } from "react-router";
import { asc, eq } from "drizzle-orm";
import type { Route } from "./+types/study-index";
import { db, kanji as kanjiTable } from "~/lib/db";

const LEVELS = ["N5", "N4", "N3"] as const;
type Level = (typeof LEVELS)[number];

function isLevel(value: string): value is Level {
  return (LEVELS as readonly string[]).includes(value);
}

export async function loader({ params }: Route.LoaderArgs) {
  if (!isLevel(params.level)) throw redirect("/");

  const first = await db.query.kanji.findFirst({
    where: eq(kanjiTable.level, params.level),
    orderBy: asc(kanjiTable.id),
    columns: { id: true },
  });

  if (!first) throw redirect("/");
  throw redirect(`/study/${params.level}/${first.id}`);
}

export default function StudyIndex() {
  return null;
}
