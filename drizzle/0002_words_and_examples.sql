CREATE TYPE "public"."example_source" AS ENUM('seed', 'generated');

CREATE TABLE "words" (
  "id" serial PRIMARY KEY NOT NULL,
  "kanji_id" integer NOT NULL,
  "reading_id" integer,
  "word" varchar(64) NOT NULL,
  "word_reading" varchar(64) NOT NULL
);

ALTER TABLE "words"
  ADD CONSTRAINT "words_kanji_id_fk"
  FOREIGN KEY ("kanji_id") REFERENCES "public"."kanji"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "words"
  ADD CONSTRAINT "words_reading_id_fk"
  FOREIGN KEY ("reading_id") REFERENCES "public"."readings"("id")
  ON DELETE set null ON UPDATE no action;

CREATE TABLE "examples" (
  "id" serial PRIMARY KEY NOT NULL,
  "word_id" integer NOT NULL,
  "sentence" jsonb NOT NULL,
  "sentence_translation_ko" text,
  "source" "example_source" DEFAULT 'seed' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "examples"
  ADD CONSTRAINT "examples_word_id_fk"
  FOREIGN KEY ("word_id") REFERENCES "public"."words"("id")
  ON DELETE cascade ON UPDATE no action;
