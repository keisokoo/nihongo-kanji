import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const jlptLevelEnum = pgEnum("jlpt_level", ["N5", "N4", "N3"]);
export const readingTypeEnum = pgEnum("reading_type", ["on", "kun"]);

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

export const examples = pgTable("examples", {
  id: serial("id").primaryKey(),
  kanjiId: integer("kanji_id")
    .notNull()
    .references(() => kanji.id, { onDelete: "cascade" }),
  readingId: integer("reading_id")
    .notNull()
    .references(() => readings.id, { onDelete: "cascade" }),
  word: varchar("word", { length: 64 }).notNull(),
  wordReading: varchar("word_reading", { length: 64 }).notNull(),
  sentence: text("sentence"),
  sentenceTranslationKo: text("sentence_translation_ko"),
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
  examples: many(examples),
}));

export const readingsRelations = relations(readings, ({ one, many }) => ({
  kanji: one(kanji, {
    fields: [readings.kanjiId],
    references: [kanji.id],
  }),
  examples: many(examples),
}));

export const examplesRelations = relations(examples, ({ one }) => ({
  kanji: one(kanji, {
    fields: [examples.kanjiId],
    references: [kanji.id],
  }),
  reading: one(readings, {
    fields: [examples.readingId],
    references: [readings.id],
  }),
}));

export type Kanji = typeof kanji.$inferSelect;
export type Reading = typeof readings.$inferSelect;
export type Example = typeof examples.$inferSelect;
export type AudioCache = typeof audioCache.$inferSelect;
