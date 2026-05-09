import type { Route } from "./+types/api.word-test.answer";
import { answerItem } from "~/lib/word-test.server";
import type { ReadingSubPick } from "~/lib/db";

export function loader() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }
  const body = (await request.json().catch(() => null)) as {
    itemId?: number;
    choice?: string;
    subPick?: ReadingSubPick;
  } | null;
  if (
    !body ||
    !Number.isFinite(Number(body.itemId)) ||
    typeof body.choice !== "string"
  ) {
    return Response.json(
      { error: "itemId and choice required" },
      { status: 400 },
    );
  }

  try {
    const result = await answerItem({
      itemId: Number(body.itemId),
      choice: body.choice,
      subPick: body.subPick,
    });
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "answer failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
