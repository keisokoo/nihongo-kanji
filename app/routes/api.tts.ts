import type { Route } from "./+types/api.tts";
import { synthesize } from "~/lib/tts.server";

export function loader() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : null;
  if (!text) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }
  const voice = typeof body?.voice === "string" ? body.voice : undefined;

  try {
    const { buffer, cached } = await synthesize({ text, voice });
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Cached": cached ? "1" : "0",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "tts failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
