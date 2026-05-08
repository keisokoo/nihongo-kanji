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

/** JLPT levels are reserved keys — custom packs cannot use these. */
export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type JlptLevel = (typeof JLPT_LEVELS)[number];

export function isJlptLevel(key: string): key is JlptLevel {
  return (JLPT_LEVELS as readonly string[]).includes(key.toUpperCase());
}
