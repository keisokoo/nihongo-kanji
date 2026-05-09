import type { Route } from "./+types/api.pack.export";
import { exportPack } from "~/lib/pack-export.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) {
    return Response.json({ error: "key required" }, { status: 400 });
  }

  try {
    const data = await exportPack(key);
    const date = data.exportedAt.slice(0, 10);
    const safeKey = data.key.replace(/[^A-Za-z0-9가-힣_-]+/g, "_");
    const filename = `nihongo-${safeKey}-${data.kind}-${date}.json`;
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "export failed";
    console.error("[api.pack.export]", message);
    return Response.json({ error: message }, { status: 400 });
  }
}
