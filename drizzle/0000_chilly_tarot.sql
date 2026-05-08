CREATE TYPE "public"."jlpt_level" AS ENUM('N5', 'N4', 'N3');--> statement-breakpoint
CREATE TYPE "public"."reading_type" AS ENUM('on', 'kun');--> statement-breakpoint
CREATE TABLE "audio_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"text_hash" varchar(64) NOT NULL,
	"text" text NOT NULL,
	"voice" varchar(32) NOT NULL,
	"file_path" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "examples" (
	"id" serial PRIMARY KEY NOT NULL,
	"kanji_id" integer NOT NULL,
	"reading_id" integer NOT NULL,
	"word" varchar(64) NOT NULL,
	"word_reading" varchar(64) NOT NULL,
	"sentence" text,
	"sentence_translation_ko" text
);
--> statement-breakpoint
CREATE TABLE "kanji" (
	"id" serial PRIMARY KEY NOT NULL,
	"character" varchar(8) NOT NULL,
	"level" "jlpt_level" NOT NULL,
	"meaning_ko" text NOT NULL,
	"stroke_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readings" (
	"id" serial PRIMARY KEY NOT NULL,
	"kanji_id" integer NOT NULL,
	"type" "reading_type" NOT NULL,
	"reading" varchar(32) NOT NULL,
	"romaji" varchar(32)
);
--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_kanji_id_kanji_id_fk" FOREIGN KEY ("kanji_id") REFERENCES "public"."kanji"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_reading_id_readings_id_fk" FOREIGN KEY ("reading_id") REFERENCES "public"."readings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_kanji_id_kanji_id_fk" FOREIGN KEY ("kanji_id") REFERENCES "public"."kanji"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audio_cache_hash_idx" ON "audio_cache" USING btree ("text_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "kanji_character_idx" ON "kanji" USING btree ("character");