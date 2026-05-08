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
    const { buffer, cached, usage } = await synthesize({ text, voice });
    const headers: Record<string, string> = {
      "Content-Type": "audio/wav",
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Cached": cached ? "1" : "0",
    };
    if (usage) {
      headers["X-Tts-Model"] = usage.model;
      headers["X-Tts-Input-Tokens"] = String(usage.inputTokens);
      headers["X-Tts-Output-Tokens"] = String(usage.outputTokens);
      headers["X-Tts-Total-Tokens"] = String(usage.totalTokens);
      headers["Access-Control-Expose-Headers"] =
        "X-Cached, X-Tts-Model, X-Tts-Input-Tokens, X-Tts-Output-Tokens, X-Tts-Total-Tokens";
    }
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "tts failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
