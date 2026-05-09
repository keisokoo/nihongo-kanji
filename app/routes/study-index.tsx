import { redirect } from "react-router";
import type { Route } from "./+types/study-index";
import { db } from "~/lib/idb/db";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const packKey = params.level;
  const pack = await db().packs.get(packKey);
  if (!pack) throw redirect("/");

  const first = await db()
    .kanji.where("packKey")
    .equals(pack.key)
    .first();

  if (!first) throw redirect("/");
  throw redirect(`/study/${encodeURIComponent(pack.key)}/${first.id}`);
}

export default function StudyIndex() {
  return null;
}
