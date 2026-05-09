import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { db } from "./db";
import { loadSettings } from "./settings";

const TTS_MODEL = "gemini-3.1-flash-tts-preview";
const TTS_VOICE = "Kore";

export type TtsUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TtsResult = {
  blob: Blob;
  cached: boolean;
  usage: TtsUsage | null;
};

async function sha256Short(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function pcmToWav(
  pcm: Uint8Array,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16,
): Uint8Array {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  // RIFF header
  out.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, 36 + dataSize, true);
  out.set(new TextEncoder().encode("WAVE"), 8);
  // fmt chunk
  out.set(new TextEncoder().encode("fmt "), 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  // data chunk
  out.set(new TextEncoder().encode("data"), 36);
  view.setUint32(40, dataSize, true);
  out.set(pcm, 44);
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function synthesize(text: string): Promise<TtsResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("text is empty");

  const hash = await sha256Short(`${TTS_MODEL}|${TTS_VOICE}|${trimmed}`);
  const cached = await db().audioCache.get(hash);
  if (cached) {
    return { blob: cached.blob, cached: true, usage: null };
  }

  const settings = await loadSettings();
  if (!settings.geminiApiKey) {
    throw new Error("GEMINI_API_KEY 미설정 — 설정에서 키를 입력해 주세요.");
  }
  const client = new GoogleGenAI({ apiKey: settings.geminiApiKey });
  const prompt = `Read aloud in natural Japanese: ${trimmed}`;

  const response = await client.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } },
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    },
  });

  const b64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) {
    console.error("[tts] empty audio", {
      model: TTS_MODEL,
      voice: TTS_VOICE,
      text: trimmed,
      finishReason: response.candidates?.[0]?.finishReason,
    });
    throw new Error("Gemini TTS returned no audio");
  }

  const pcm = base64ToBytes(b64);
  const wav = pcmToWav(pcm);
  const blob = new Blob([wav.slice().buffer as ArrayBuffer], {
    type: "audio/wav",
  });

  await db().audioCache.put({
    textHash: hash,
    text: trimmed,
    voice: TTS_VOICE,
    model: TTS_MODEL,
    blob,
    createdAt: new Date(),
  });

  const meta = response.usageMetadata;
  const usage: TtsUsage = {
    model: TTS_MODEL,
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
    totalTokens:
      meta?.totalTokenCount ??
      (meta?.promptTokenCount ?? 0) + (meta?.candidatesTokenCount ?? 0),
  };

  return { blob, cached: false, usage };
}
