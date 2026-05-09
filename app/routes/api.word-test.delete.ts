import type { Route } from "./+types/api.word-test.delete";
import { deleteWordTest } from "~/lib/word-test.server";

export function loader() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }
  const body = (await request.json().catch(() => null)) as {
    testId?: number;
  } | null;
  const id = Number(body?.testId);
  if (!Number.isFinite(id)) {
    return Response.json({ error: "testId required" }, { status: 400 });
  }
  try {
    await deleteWordTest(id);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "delete failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
