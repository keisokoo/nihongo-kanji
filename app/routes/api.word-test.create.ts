import type { Route } from "./+types/api.word-test.create";
import { createWordTest } from "~/lib/word-test.server";
import type { WordTestKind } from "~/lib/db";

export function loader() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    kind?: WordTestKind;
    packs?: Array<{ packKey: string; count: number | "all" }>;
  } | null;
  if (
    !body ||
    typeof body.name !== "string" ||
    !Array.isArray(body.packs) ||
    (body.kind !== "meaning" && body.kind !== "reading")
  ) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const result = await createWordTest({
      name: body.name,
      kind: body.kind,
      packs: body.packs,
    });
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "create failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
