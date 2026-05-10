import { redirect } from "react-router";
import type { Route } from "./+types/grammar-index";
import { db } from "~/lib/idb/db";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const packKey = params.packKey;
  const pack = await db().grammarPacks.get(packKey);
  if (!pack) throw redirect("/");

  const first = await db()
    .grammarItems.where("packKey")
    .equals(pack.key)
    .sortBy("position");
  if (first.length === 0) throw redirect("/");

  throw redirect(
    `/grammar/${encodeURIComponent(pack.key)}/${first[0].id}`,
  );
}

export default function GrammarIndex() {
  return null;
}
