import { importPack, type PackImportInput } from "./pack";
import { markSeedInstalled } from "./settings";

export type SeedManifestEntry = {
  level: string;
  path: string;
  kanji: number;
  words: number;
  examples: number;
  bytes: number;
};

export type SeedManifest = {
  version: number;
  files: SeedManifestEntry[];
};

export type SeedProgress =
  | { kind: "manifest" }
  | { kind: "fetching"; level: string; index: number; total: number }
  | { kind: "applying"; level: string; index: number; total: number }
  | {
      kind: "applied";
      level: string;
      index: number;
      total: number;
      stats: { kanji: number; words: number; examples: number };
    }
  | { kind: "done"; total: number }
  | { kind: "error"; level: string; message: string };

export async function fetchManifest(): Promise<SeedManifest> {
  const res = await fetch("/seed/manifest.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  return (await res.json()) as SeedManifest;
}

/**
 * Install the bundled seeds into IndexedDB. Streams progress via the optional
 * onProgress callback. Idempotent: re-running over an existing install replaces
 * the seed data (preserves user-added AI content because importPack only
 * overwrites kanji that exist in the seed input).
 */
export async function installSeeds(
  onProgress?: (p: SeedProgress) => void,
): Promise<{ totalKanji: number; totalWords: number; totalExamples: number }> {
  onProgress?.({ kind: "manifest" });
  const manifest = await fetchManifest();
  const total = manifest.files.length;
  const totals = { totalKanji: 0, totalWords: 0, totalExamples: 0 };

  for (let i = 0; i < manifest.files.length; i++) {
    const entry = manifest.files[i];
    onProgress?.({
      kind: "fetching",
      level: entry.level,
      index: i,
      total,
    });

    let json: PackImportInput;
    try {
      const res = await fetch(entry.path, { cache: "force-cache" });
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      json = (await res.json()) as PackImportInput;
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch failed";
      onProgress?.({ kind: "error", level: entry.level, message });
      throw err;
    }

    onProgress?.({ kind: "applying", level: entry.level, index: i, total });

    try {
      const { stats } = await importPack(json, { allowJlpt: true });
      totals.totalKanji += stats.kanji;
      totals.totalWords += stats.words;
      totals.totalExamples += stats.examples;
      onProgress?.({
        kind: "applied",
        level: entry.level,
        index: i,
        total,
        stats: {
          kanji: stats.kanji,
          words: stats.words,
          examples: stats.examples,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "import failed";
      onProgress?.({ kind: "error", level: entry.level, message });
      throw err;
    }
  }

  await markSeedInstalled();
  onProgress?.({ kind: "done", total });
  return totals;
}
