import { importPack, type PackImportInput } from "./pack";
import { importGrammarPack } from "./grammar-pack";
import { markSeedInstalled } from "./settings";
import type { GrammarSeedFile } from "./grammar-types";

export type SeedManifestEntry = {
  level: string;
  path: string;
  kanji: number;
  words: number;
  examples: number;
  bytes: number;
};

export type GrammarSeedManifestEntry = {
  level: string;
  path: string;
  items: number;
  examples: number;
  quizzes: number;
  bytes: number;
};

export type SeedManifest = {
  version: number;
  files: SeedManifestEntry[];
  /** v2 — present when grammar seeds are bundled. Optional for back-compat. */
  grammar?: GrammarSeedManifestEntry[];
};

/** What's currently being installed — kanji 한자팩 vs grammar 문법팩. */
export type SeedPackKind = "kanji" | "grammar";

export type SeedProgress =
  | { kind: "manifest" }
  | {
      kind: "fetching";
      pack: SeedPackKind;
      level: string;
      index: number;
      total: number;
    }
  | {
      kind: "applying";
      pack: SeedPackKind;
      level: string;
      index: number;
      total: number;
    }
  | {
      kind: "applied";
      pack: "kanji";
      level: string;
      index: number;
      total: number;
      stats: { kanji: number; words: number; examples: number };
    }
  | {
      kind: "applied";
      pack: "grammar";
      level: string;
      index: number;
      total: number;
      stats: { items: number; examples: number; quizzes: number };
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
): Promise<{
  totalKanji: number;
  totalWords: number;
  totalExamples: number;
  totalGrammarItems: number;
  totalGrammarQuizzes: number;
}> {
  onProgress?.({ kind: "manifest" });
  const manifest = await fetchManifest();
  const grammarFiles = manifest.grammar ?? [];
  const total = manifest.files.length + grammarFiles.length;
  const totals = {
    totalKanji: 0,
    totalWords: 0,
    totalExamples: 0,
    totalGrammarItems: 0,
    totalGrammarQuizzes: 0,
  };

  // 1) Kanji packs.
  for (let i = 0; i < manifest.files.length; i++) {
    const entry = manifest.files[i];
    onProgress?.({
      kind: "fetching",
      pack: "kanji",
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

    onProgress?.({
      kind: "applying",
      pack: "kanji",
      level: entry.level,
      index: i,
      total,
    });

    try {
      const { stats } = await importPack(json, { allowJlpt: true });
      totals.totalKanji += stats.kanji;
      totals.totalWords += stats.words;
      totals.totalExamples += stats.examples;
      onProgress?.({
        kind: "applied",
        pack: "kanji",
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

  // 2) Grammar packs (optional in manifest).
  for (let i = 0; i < grammarFiles.length; i++) {
    const entry = grammarFiles[i];
    const idx = manifest.files.length + i;
    onProgress?.({
      kind: "fetching",
      pack: "grammar",
      level: entry.level,
      index: idx,
      total,
    });

    let json: GrammarSeedFile;
    try {
      const res = await fetch(entry.path, { cache: "force-cache" });
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      json = (await res.json()) as GrammarSeedFile;
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch failed";
      onProgress?.({ kind: "error", level: entry.level, message });
      throw err;
    }

    onProgress?.({
      kind: "applying",
      pack: "grammar",
      level: entry.level,
      index: idx,
      total,
    });

    try {
      const { stats } = await importGrammarPack(json, { allowJlpt: true });
      totals.totalGrammarItems += stats.items;
      totals.totalGrammarQuizzes += stats.quizzes;
      onProgress?.({
        kind: "applied",
        pack: "grammar",
        level: entry.level,
        index: idx,
        total,
        stats,
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
