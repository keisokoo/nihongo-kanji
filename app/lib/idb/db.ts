import Dexie, { type Table } from "dexie";
import type {
  AudioCacheRow,
  Example,
  Kanji,
  Pack,
  Reading,
  SettingsRow,
  WeakItemMastery,
  Word,
  WordTest,
  WordTestItem,
} from "./types";
import type {
  GrammarItem,
  GrammarPack,
  GrammarTest,
  GrammarTestItem,
} from "./grammar-types";

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
  /** v2 — 문법팩. examples/quizzes 는 GrammarItem 안에 임베디드. */
  grammarPacks!: Table<GrammarPack, string>;
  grammarItems!: Table<GrammarItem, number>;
  /** v3 — 문법 시험. */
  grammarTests!: Table<GrammarTest, number>;
  grammarTestItems!: Table<GrammarTestItem, number>;
  /** v4 — 오답노트 mastery. composite primary key: [testKind+sourceId]. */
  weakItemMastery!: Table<WeakItemMastery, [string, number]>;

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

    // v2: 문법팩 스토어 추가. 기존 v1 스토어는 그대로 유지 — Dexie 가 새
    // 스토어만 생성. 기존 사용자 IDB 도 onupgradeneeded 로 자동 마이그레이션.
    this.version(2).stores({
      grammarPacks: "&key, kind, level, createdAt",
      grammarItems: "++id, packKey, &[packKey+pattern], [packKey+position]",
    });

    // v3: 문법 시험.
    this.version(3).stores({
      grammarTests: "++id, createdAt",
      grammarTestItems: "++id, testId, [testId+position]",
    });

    // v4: 오답노트.
    this.version(4).stores({
      weakItemMastery: "&[testKind+sourceId], masteredAt",
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
