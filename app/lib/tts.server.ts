import { createHash } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { db, audioCache } from "./db";
import { eq } from "drizzle-orm";

const AUDIO_DIR = join(process.cwd(), "public", "audio");
const PUBLIC_PREFIX = "/audio";

const DEFAULT_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
const DEFAULT_VOICE = process.env.GEMINI_TTS_VOICE ?? "Kore";

let _client: GoogleGenAI | null = null;
function client() {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

function hashKey(text: string, voice: string, model: string) {
  return createHash("sha256").update(`${model}|${voice}|${text}`).digest("hex").slice(0, 32);
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Gemini returns 16-bit PCM @ 24kHz mono. Wrap into a WAV container.
function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

export type TtsOptions = {
  text: string;
  voice?: string;
  model?: string;
};

export type TtsResult = {
  url: string;
  cached: boolean;
};

export async function synthesize({
  text,
  voice = DEFAULT_VOICE,
  model = DEFAULT_MODEL,
}: TtsOptions): Promise<TtsResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("text is empty");

  const hash = hashKey(trimmed, voice, model);
  const fileName = `${hash}.wav`;
  const filePath = join(AUDIO_DIR, fileName);
  const publicUrl = `${PUBLIC_PREFIX}/${fileName}`;

  const cached = await db.query.audioCache.findFirst({
    where: eq(audioCache.textHash, hash),
  });
  if (cached && (await exists(filePath))) {
    return { url: cached.filePath, cached: true };
  }

  const response = await client().models.generateContent({
    model,
    contents: [{ parts: [{ text: trimmed }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
      },
    },
  });

  const audioPart = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data,
  );
  const b64 = audioPart?.inlineData?.data;
  if (!b64) throw new Error("Gemini TTS returned no audio");

  const pcm = Buffer.from(b64, "base64");
  const wav = pcmToWav(pcm);

  await mkdir(AUDIO_DIR, { recursive: true });
  await writeFile(filePath, wav);

  await db
    .insert(audioCache)
    .values({ textHash: hash, text: trimmed, voice, filePath: publicUrl })
    .onConflictDoNothing();

  return { url: publicUrl, cached: false };
}
