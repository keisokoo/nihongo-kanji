import Dexie, { type Table } from "dexie";
import type {
  AudioCacheRow,
  Example,
  Kanji,
  Pack,
  Reading,
  SettingsRow,
  Word,
  WordTest,
  WordTestItem,
} from "./types";

/**
 * Single Dexie database for the entire app.
 *
 * Index strings:
 *   "&key"        — primary, unique
 *   "++id"        — primary, auto-increment
 *   "field"       — secondary index
 *   "[a+b]"       — compound index
 *   "&[a+b]"      — compound, unique
 */
export class NihongoDB extends Dexie {
  packs!: Table<Pack, string>;
  kanji!: Table<Kanji, number>;
  readings!: Table<Reading, number>;
  words!: Table<Word, number>;
  examples!: Table<Example, number>;
  wordTests!: Table<WordTest, number>;
  wordTestItems!: Table<WordTestItem, number>;
  audioCache!: Table<AudioCacheRow, string>;
  settings!: Table<SettingsRow, 1>;

  constructor() {
    super("nihongo");

    this.version(1).stores({
      packs: "&key, kind, createdAt",
      kanji: "++id, packKey, character, &[packKey+character]",
      readings: "++id, kanjiId, [kanjiId+reading]",
      words: "++id, kanjiId, readingId, [kanjiId+word+wordReading]",
      examples: "++id, wordId",
      wordTests: "++id, createdAt",
      wordTestItems: "++id, testId, [testId+position]",
      audioCache: "&textHash, createdAt",
      settings: "&id",
    });
  }
}

let _db: NihongoDB | null = null;

export function db(): NihongoDB {
  if (typeof window === "undefined") {
    throw new Error(
      "IndexedDB is browser-only — guard SSR or use a route loader that runs client-side",
    );
  }
  if (!_db) _db = new NihongoDB();
  return _db;
}

/** For tests / dev-tools: wipe the entire DB and recreate. */
export async function resetDb(): Promise<void> {
  const inst = db();
  inst.close();
  await Dexie.delete("nihongo");
  _db = null;
}
