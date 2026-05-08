import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { db, audioCache } from "./db";

const CACHE_DIR = join(process.cwd(), ".cache", "tts");

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

async function fileExists(path: string) {
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

export type TtsUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TtsResult = {
  buffer: Buffer;
  cached: boolean;
  usage: TtsUsage | null;
};

export async function synthesize({
  text,
  voice = DEFAULT_VOICE,
  model = DEFAULT_MODEL,
}: TtsOptions): Promise<TtsResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("text is empty");

  const hash = hashKey(trimmed, voice, model);
  const filePath = join(CACHE_DIR, `${hash}.wav`);

  if (await fileExists(filePath)) {
    return { buffer: await readFile(filePath), cached: true, usage: null };
  }

  // Wrap with an explicit pronunciation instruction.
  // Short isolated kana/kanji can be flagged as PROHIBITED_CONTENT by Gemini's
  // safety filter; the wrapper makes intent unambiguous.
  const prompt = `Read aloud in natural Japanese: ${trimmed}`;

  const response = await client().models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    },
  });

  const b64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) {
    console.error("[tts] empty audio response:", {
      model,
      voice,
      text: trimmed,
      finishReason: response.candidates?.[0]?.finishReason,
      candidate: JSON.stringify(response.candidates?.[0] ?? null).slice(0, 1500),
      promptFeedback: JSON.stringify(
        (response as unknown as { promptFeedback?: unknown }).promptFeedback ?? null,
      ),
    });
    throw new Error("Gemini TTS returned no audio");
  }

  const pcm = Buffer.from(b64, "base64");
  const wav = pcmToWav(pcm);

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(filePath, wav);

  await db
    .insert(audioCache)
    .values({ textHash: hash, text: trimmed, voice, filePath })
    .onConflictDoNothing();

  const meta = response.usageMetadata;
  const usage: TtsUsage = {
    model,
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
    totalTokens:
      meta?.totalTokenCount ??
      (meta?.promptTokenCount ?? 0) + (meta?.candidatesTokenCount ?? 0),
  };

  return { buffer: wav, cached: false, usage };
}
