/**
 * Domain types for the IndexedDB-backed app. These mirror the previous
 * Postgres schema (see app/lib/db/schema.ts before the IDB migration).
 *
 * Differences vs the PG version:
 * - Auto-increment integer ids ("id") map cleanly onto Dexie's `++id`.
 * - jsonb columns become plain TypeScript values (no serialization layer).
 * - Date columns are stored as `Date` objects natively.
 * - Foreign keys are NOT enforced by IDB; cleanup logic is in client libs.
 */

export type SentenceToken = {
  text: string;
  reading?: string;
  target?: true;
};

export type WordExplanation = {
  reasoning: string;
  mnemonic: string;
  modelUsed: string;
  createdAt: string;
};

export type ExampleExplanation = {
  nuance: string;
  grammar: string;
  pronunciation: string;
  takeaways: string;
  modelUsed: string;
  createdAt: string;
};

export type ReadingType = "on" | "kun";
export type ExampleSource = "seed" | "generated";
export type PackKind = "jlpt" | "custom";
export type WordTestMode = "jp_to_ko" | "ko_to_jp";
export type WordTestKind = "meaning" | "reading";
export type ReadingSubPick = "reading" | "meaning";

export type Pack = {
  key: string;            // primary key
  title: string;
  kind: PackKind;
  description: string | null;
  createdAt: Date;
};

export type Kanji = {
  id: number;             // ++id
  packKey: string;        // index, also part of [packKey+character] uniq
  character: string;      // index
  meaningKo: string;
  strokeCount: number | null;
  createdAt: Date;
};

export type Reading = {
  id: number;             // ++id
  kanjiId: number;        // index
  type: ReadingType;
  reading: string;
  romaji: string | null;
};

export type Word = {
  id: number;             // ++id
  kanjiId: number;        // index
  readingId: number | null;
  word: string;
  wordReading: string;
  meaningsKo: string[];
  source: ExampleSource;
  createdAt: Date;
  explanation: WordExplanation | null;
};

export type Example = {
  id: number;             // ++id
  wordId: number;         // index
  sentence: SentenceToken[];
  sentenceTranslationKo: string | null;
  source: ExampleSource;
  createdAt: Date;
  explanation: ExampleExplanation | null;
};

export type WordTest = {
  id: number;             // ++id
  name: string;
  kind: WordTestKind;
  sourcePacks: string[];
  total: number;
  createdAt: Date;
};

export type WordTestItem = {
  id: number;             // ++id
  testId: number;         // index
  position: number;
  sourceWordId: number | null;
  word: string;
  wordReading: string;
  meaningsKo: string[];
  mode: WordTestMode | null;
  pickedChoice: string | null;
  isCorrect: boolean | null;
  pickedReading: string | null;
  isCorrectReading: boolean | null;
  pickedMeaning: string | null;
  isCorrectMeaning: boolean | null;
  answeredAt: Date | null;
};

/**
 * TTS audio cache. Stores the WAV blob directly so playback can fetch
 * by hash without re-calling the TTS API.
 */
export type AudioCacheRow = {
  textHash: string;       // primary key (sha256(model|voice|text), short hex)
  text: string;
  voice: string;
  model: string;
  blob: Blob;
  createdAt: Date;
};

/**
 * AES-GCM encrypted secret. Stored in IDB. Decrypted in memory only.
 */
export type EncryptedSecret = {
  iv: Uint8Array;          // 12 bytes
  ciphertext: Uint8Array;
};

/**
 * Single-row settings store as actually persisted in IDB.
 * - API keys are stored encrypted with a non-extractable AES-GCM CryptoKey.
 * - The wrapping key itself is stored as a CryptoKey (structured-clone safe).
 *
 * This raises the bar against casual snooping (DevTools, shared device, IDB
 * dump) but does NOT defend against XSS — same-origin JS can call
 * subtle.decrypt with the stored key just like the app does.
 */
export type SettingsRow = {
  id: 1;
  anthropicApiKey: EncryptedSecret | null;
  geminiApiKey: EncryptedSecret | null;
  /** Non-extractable AES-GCM 256 key. Created on first save. */
  wrappingKey: CryptoKey | null;
  seedInstalled: boolean;
  seedInstalledAt: Date | null;
  updatedAt: Date;
};

/**
 * Public settings shape used by the rest of the app — keys are decrypted
 * strings here. Construct via loadSettings().
 */
export type Settings = {
  anthropicApiKey: string | null;
  geminiApiKey: string | null;
  seedInstalled: boolean;
  seedInstalledAt: Date | null;
  updatedAt: Date;
};

export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type JlptLevel = (typeof JLPT_LEVELS)[number];

export function isJlptLevel(key: string): key is JlptLevel {
  return (JLPT_LEVELS as readonly string[]).includes(key.toUpperCase());
}
