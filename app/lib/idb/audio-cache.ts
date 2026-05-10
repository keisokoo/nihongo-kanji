import JSZip from "jszip";
import { db } from "./db";
import type { AudioCacheRow } from "./types";

/**
 * 음성 캐시 (audioCache) 의 일괄 export / import — ZIP 번들 형식.
 *
 * 구조:
 *   manifest.json
 *   audio/<textHash>.wav (binary)
 *
 * WAV 가 base64 안 거치고 binary 그대로 들어가서 같은 캐시가 ~25% 더 작음.
 * 또한 ZIP 의 deflate 압축으로 metadata (manifest.json) 도 작아짐.
 */

export type AudioCacheManifest = {
  version: 1;
  kind: "audio-cache";
  exportedAt: string;
  rows: ManifestRow[];
};

type ManifestRow = {
  textHash: string;
  text: string;
  voice: string;
  model: string;
  mime: string;
  /** ZIP 안의 파일 경로. 보통 `audio/<textHash>.wav`. */
  file: string;
};

export async function exportAudioCache(): Promise<{
  blob: Blob;
  count: number;
}> {
  const d = db();
  const rows = await d.audioCache.toArray();
  const zip = new JSZip();
  const manifestRows: ManifestRow[] = [];
  const audioDir = zip.folder("audio");
  if (!audioDir) throw new Error("zip folder create failed");

  for (const row of rows) {
    const filename = `${row.textHash}.wav`;
    audioDir.file(filename, row.blob);
    manifestRows.push({
      textHash: row.textHash,
      text: row.text,
      voice: row.voice,
      model: row.model,
      mime: row.blob.type || "audio/wav",
      file: `audio/${filename}`,
    });
  }

  const manifest: AudioCacheManifest = {
    version: 1,
    kind: "audio-cache",
    exportedAt: new Date().toISOString(),
    rows: manifestRows,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // WAV 는 이미 비압축 PCM — deflate 가 약간 줄여줌. 빠르게 가려면 store(0).
  // metadata 자체는 작으니 default(deflate) 로.
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 1 }, // fast
  });
  return { blob, count: rows.length };
}

export type AudioImportResult = {
  added: number;
  skipped: number; // textHash 중복
  invalid: number; // 매니페스트 누락 / 파일 누락
};

export async function importAudioCache(
  file: Blob,
  opts: { overwrite?: boolean } = {},
): Promise<AudioImportResult> {
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) {
    throw new Error("manifest.json not found in zip");
  }
  const manifestText = await manifestEntry.async("string");
  const manifest = JSON.parse(manifestText) as AudioCacheManifest;
  if (manifest.kind !== "audio-cache") {
    throw new Error(`expected kind "audio-cache", got "${manifest.kind}"`);
  }
  if (!Array.isArray(manifest.rows)) {
    throw new Error("manifest.rows missing");
  }

  const d = db();
  const result: AudioImportResult = { added: 0, skipped: 0, invalid: 0 };

  // 기존 hash 를 한번에 모음
  const existingHashes = new Set<string>();
  await d.audioCache.each((r) => existingHashes.add(r.textHash));

  for (const row of manifest.rows) {
    if (!row.textHash || !row.file) {
      result.invalid++;
      continue;
    }
    if (existingHashes.has(row.textHash) && !opts.overwrite) {
      result.skipped++;
      continue;
    }
    const fileEntry = zip.file(row.file);
    if (!fileEntry) {
      result.invalid++;
      continue;
    }
    const arr = await fileEntry.async("uint8array");
    const blob = new Blob([arr.buffer as ArrayBuffer], {
      type: row.mime || "audio/wav",
    });
    const cacheRow: AudioCacheRow = {
      textHash: row.textHash,
      text: row.text ?? "",
      voice: row.voice ?? "",
      model: row.model ?? "",
      blob,
      createdAt: new Date(),
    };
    await d.audioCache.put(cacheRow);
    result.added++;
  }

  return result;
}

export async function getAudioCacheCount(): Promise<number> {
  const d = db();
  return d.audioCache.count();
}
