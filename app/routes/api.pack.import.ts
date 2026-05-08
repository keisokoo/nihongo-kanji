import type { Route } from "./+types/api.pack.import";
import { importPack, type PackImportInput } from "~/lib/pack.server";

export function loader() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  let body: PackImportInput;
  try {
    body = (await request.json()) as PackImportInput;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const { pack, stats } = await importPack(body, { allowJlpt: false });
    return Response.json({ pack, stats });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "import failed";
    console.error("[api.pack.import]", message);
    return Response.json({ error: message }, { status: 400 });
  }
}
