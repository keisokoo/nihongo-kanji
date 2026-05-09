import { db } from "./db";

export type IdbUsage = {
  /** Bytes used by IndexedDB on this origin (browser estimate). */
  usage: number;
  /** Quota the browser is willing to give. */
  quota: number;
  /** Row counts per table — exact, scanned from IDB. */
  counts: {
    packs: number;
    kanji: number;
    readings: number;
    words: number;
    examples: number;
    wordTests: number;
    wordTestItems: number;
    audioCache: number;
  };
  /** Approximate audio cache blob size (sum of blob sizes in bytes). */
  audioCacheBytes: number;
};

export async function loadUsage(): Promise<IdbUsage> {
  const d = db();

  const [usage, counts, audioCacheBytes] = await Promise.all([
    estimateBytes(),
    countAll(d),
    sumAudioBytes(d),
  ]);

  return {
    usage: usage.usage,
    quota: usage.quota,
    counts,
    audioCacheBytes,
  };
}

async function estimateBytes(): Promise<{ usage: number; quota: number }> {
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  }
  return { usage: 0, quota: 0 };
}

async function countAll(d: ReturnType<typeof db>) {
  const [
    packs,
    kanji,
    readings,
    words,
    examples,
    wordTests,
    wordTestItems,
    audioCache,
  ] = await Promise.all([
    d.packs.count(),
    d.kanji.count(),
    d.readings.count(),
    d.words.count(),
    d.examples.count(),
    d.wordTests.count(),
    d.wordTestItems.count(),
    d.audioCache.count(),
  ]);
  return {
    packs,
    kanji,
    readings,
    words,
    examples,
    wordTests,
    wordTestItems,
    audioCache,
  };
}

async function sumAudioBytes(d: ReturnType<typeof db>): Promise<number> {
  let total = 0;
  await d.audioCache.each((row) => {
    total += row.blob.size;
  });
  return total;
}
