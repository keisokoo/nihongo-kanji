import type { Route } from "./+types/api.pack.import";
import { importPack, type PackImportInput } from "~/lib/pack.server";
import {
  importJlptDelta,
  type DeltaImportMode,
  type PackExport,
} from "~/lib/pack-import-delta.server";

export function loader() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}

type ImportBody =
  // jlpt-delta with mode appended client-side
  | (PackExport & { mode?: DeltaImportMode })
  // custom-full export OR raw seed-format input (handled by importPack)
  | (PackImportInput & { kind?: "custom-full" });

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    if ((body as PackExport).kind === "jlpt-delta") {
      const exp = body as PackExport & { mode?: DeltaImportMode };
      const mode: DeltaImportMode = exp.mode === "merge" ? "merge" : "replace";
      const result = await importJlptDelta(exp, mode);
      return Response.json({ kind: "jlpt-delta", result });
    }

    // custom-full export OR raw seed-format input — both share the same
    // PackImportInput shape and can go through importPack.
    const { pack, stats } = await importPack(body as PackImportInput, {
      allowJlpt: false,
    });
    return Response.json({ kind: "custom", pack, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "import failed";
    console.error("[api.pack.import]", message);
    return Response.json({ error: message }, { status: 400 });
  }
}
