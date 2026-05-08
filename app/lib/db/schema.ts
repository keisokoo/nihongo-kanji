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

export const jlptLevelEnum = pgEnum("jlpt_level", ["N5", "N4", "N3"]);
export const readingTypeEnum = pgEnum("reading_type", ["on", "kun"]);
export const exampleSourceEnum = pgEnum("example_source", ["seed", "generated"]);

export const kanji = pgTable(
  "kanji",
  {
    id: serial("id").primaryKey(),
    character: varchar("character", { length: 8 }).notNull(),
    level: jlptLevelEnum("level").notNull(),
    meaningKo: text("meaning_ko").notNull(),
    strokeCount: integer("stroke_count"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("kanji_character_idx").on(t.character)],
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

export const kanjiRelations = relations(kanji, ({ many }) => ({
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
