import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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
  /** 한국어 의역과 일본어 원문의 늬앙스 차이, 일본식 표현. */
  nuance: string;
  /** 문법 구조 / 활용 / 입자 (조사) 분석. */
  grammar: string;
  /** 발음(연탁/음편화/숙자훈) 또는 학습 포인트. 비어 있을 수 있음. */
  pronunciation: string;
  /** 관용 표현, 알아두면 좋은 어휘/관용구. */
  takeaways: string;
  modelUsed: string;
  createdAt: string;
};

export const readingTypeEnum = pgEnum("reading_type", ["on", "kun"]);
export const exampleSourceEnum = pgEnum("example_source", ["seed", "generated"]);
export const packKindEnum = pgEnum("pack_kind", ["jlpt", "custom"]);
export const wordTestModeEnum = pgEnum("word_test_mode", [
  "jp_to_ko",
  "ko_to_jp",
]);
export const wordTestKindEnum = pgEnum("word_test_kind", [
  "meaning",
  "reading",
]);

/**
 * A pack is a top-level kanji collection. Pre-seeded JLPT levels (N5-N1)
 * have kind="jlpt"; user-imported custom collections have kind="custom".
 * Custom pack keys cannot collide with JLPT keys (validated at the API layer).
 */
export const packs = pgTable("packs", {
  key: varchar("key", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 128 }).notNull(),
  kind: packKindEnum("kind").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const kanji = pgTable(
  "kanji",
  {
    id: serial("id").primaryKey(),
    character: varchar("character", { length: 8 }).notNull(),
    packKey: varchar("pack_key", { length: 64 })
      .notNull()
      .references(() => packs.key, { onDelete: "cascade" }),
    meaningKo: text("meaning_ko").notNull(),
    strokeCount: integer("stroke_count"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("kanji_pack_character_idx").on(t.packKey, t.character)],
);

export const readings = pgTable("readings", {
  id: serial("id").primaryKey(),
  kanjiId: integer("kanji_id")
    .notNull()
    .references(() => kanji.id, { onDelete: "cascade" }),
  type: readingTypeEnum("type").notNull(),
  reading: varchar("reading", { length: 32 }).notNull(),
  romaji: varchar("romaji", { length: 32 }),
});

export const words = pgTable("words", {
  id: serial("id").primaryKey(),
  kanjiId: integer("kanji_id")
    .notNull()
    .references(() => kanji.id, { onDelete: "cascade" }),
  readingId: integer("reading_id").references(() => readings.id, {
    onDelete: "set null",
  }),
  word: varchar("word", { length: 64 }).notNull(),
  wordReading: varchar("word_reading", { length: 64 }).notNull(),
  /** 1-3 short Korean meanings (translation candidates) for word-test mode. */
  meaningsKo: jsonb("meanings_ko").$type<string[]>().notNull().default([]),
  source: exampleSourceEnum("source").notNull().default("seed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  explanation: jsonb("explanation").$type<WordExplanation>(),
});

export const examples = pgTable("examples", {
  id: serial("id").primaryKey(),
  wordId: integer("word_id")
    .notNull()
    .references(() => words.id, { onDelete: "cascade" }),
  sentence: jsonb("sentence").$type<SentenceToken[]>().notNull(),
  sentenceTranslationKo: text("sentence_translation_ko"),
  source: exampleSourceEnum("source").notNull().default("seed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  explanation: jsonb("explanation").$type<ExampleExplanation>(),
});

/**
 * A word test ("시험장") — a snapshot of words sourced from one or more packs,
 * for the meaning-quiz mode. Item ordering, mode, and answer state are
 * persisted so the user can pause and resume.
 */
export const wordTests = pgTable("word_tests", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  /**
   * "meaning" — JP↔KO 4-choice (current). One pick per item.
   * "reading" — for each word: pick reading + pick meaning (two sub-picks).
   */
  kind: wordTestKindEnum("kind").notNull().default("meaning"),
  /** Pack keys included at creation, for display only. */
  sourcePacks: jsonb("source_packs").$type<string[]>().notNull().default([]),
  total: integer("total").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const wordTestItems = pgTable("word_test_items", {
  id: serial("id").primaryKey(),
  testId: integer("test_id")
    .notNull()
    .references(() => wordTests.id, { onDelete: "cascade" }),
  /** Order within the test (0-indexed). */
  position: integer("position").notNull(),
  /** Original source word; nullable so a deleted source word doesn't drop items. */
  sourceWordId: integer("source_word_id").references(() => words.id, {
    onDelete: "set null",
  }),
  word: varchar("word", { length: 64 }).notNull(),
  wordReading: varchar("word_reading", { length: 64 }).notNull(),
  meaningsKo: jsonb("meanings_ko").$type<string[]>().notNull(),
  /** kind="meaning" only — the JP↔KO direction. NULL for reading kind. */
  mode: wordTestModeEnum("mode"),
  /** kind="meaning": the single pick. NULL for reading kind. */
  pickedChoice: text("picked_choice"),
  isCorrect: boolean("is_correct"),
  /** kind="reading": reading sub-pick. */
  pickedReading: text("picked_reading"),
  isCorrectReading: boolean("is_correct_reading"),
  /** kind="reading": meaning sub-pick. */
  pickedMeaning: text("picked_meaning"),
  isCorrectMeaning: boolean("is_correct_meaning"),
  /** Set when item fully answered (meaning: 1 pick; reading: BOTH sub-picks). */
  answeredAt: timestamp("answered_at"),
});

export const wordTestsRelations = relations(wordTests, ({ many }) => ({
  items: many(wordTestItems),
}));

export const wordTestItemsRelations = relations(wordTestItems, ({ one }) => ({
  test: one(wordTests, {
    fields: [wordTestItems.testId],
    references: [wordTests.id],
  }),
}));

export const audioCache = pgTable(
  "audio_cache",
  {
    id: serial("id").primaryKey(),
    textHash: varchar("text_hash", { length: 64 }).notNull(),
    text: text("text").notNull(),
    voice: varchar("voice", { length: 32 }).notNull(),
    filePath: varchar("file_path", { length: 256 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("audio_cache_hash_idx").on(t.textHash)],
);

export const packsRelations = relations(packs, ({ many }) => ({
  kanji: many(kanji),
}));

export const kanjiRelations = relations(kanji, ({ one, many }) => ({
  pack: one(packs, {
    fields: [kanji.packKey],
    references: [packs.key],
  }),
  readings: many(readings),
  words: many(words),
}));

export const readingsRelations = relations(readings, ({ one, many }) => ({
  kanji: one(kanji, {
    fields: [readings.kanjiId],
    references: [kanji.id],
  }),
  words: many(words),
}));

export const wordsRelations = relations(words, ({ one, many }) => ({
  kanji: one(kanji, {
    fields: [words.kanjiId],
    references: [kanji.id],
  }),
  reading: one(readings, {
    fields: [words.readingId],
    references: [readings.id],
  }),
  examples: many(examples),
}));

export const examplesRelations = relations(examples, ({ one }) => ({
  word: one(words, {
    fields: [examples.wordId],
    references: [words.id],
  }),
}));

export type Kanji = typeof kanji.$inferSelect;
export type Reading = typeof readings.$inferSelect;
export type Word = typeof words.$inferSelect;
export type Example = typeof examples.$inferSelect;
export type AudioCache = typeof audioCache.$inferSelect;
export type Pack = typeof packs.$inferSelect;
export type PackKind = (typeof packKindEnum.enumValues)[number];
export type WordTest = typeof wordTests.$inferSelect;
export type WordTestItem = typeof wordTestItems.$inferSelect;
export type WordTestMode = (typeof wordTestModeEnum.enumValues)[number];
export type WordTestKind = (typeof wordTestKindEnum.enumValues)[number];
export type ReadingSubPick = "reading" | "meaning";

/** JLPT levels are reserved keys — custom packs cannot use these. */
export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type JlptLevel = (typeof JLPT_LEVELS)[number];

export function isJlptLevel(key: string): key is JlptLevel {
  return (JLPT_LEVELS as readonly string[]).includes(key.toUpperCase());
}
