CREATE TYPE "word_test_mode" AS ENUM ('jp_to_ko', 'ko_to_jp');

CREATE TABLE "word_tests" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(128) NOT NULL,
  "source_packs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "total" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "word_test_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "test_id" integer NOT NULL REFERENCES "word_tests"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "source_word_id" integer REFERENCES "words"("id") ON DELETE SET NULL,
  "word" varchar(64) NOT NULL,
  "word_reading" varchar(64) NOT NULL,
  "meanings_ko" jsonb NOT NULL,
  "mode" word_test_mode NOT NULL,
  "picked_choice" text,
  "is_correct" boolean,
  "answered_at" timestamp
);

CREATE INDEX "word_test_items_test_id_position_idx"
  ON "word_test_items" ("test_id", "position");
