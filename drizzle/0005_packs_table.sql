-- Add packs table + migrate kanji.level → kanji.pack_key

CREATE TYPE "public"."pack_kind" AS ENUM('jlpt', 'custom');

CREATE TABLE "packs" (
  "key" varchar(64) PRIMARY KEY NOT NULL,
  "title" varchar(128) NOT NULL,
  "kind" "pack_kind" NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Pre-seed JLPT packs (N5-N1).
INSERT INTO "packs" ("key", "title", "kind") VALUES
  ('N5', 'N5', 'jlpt'),
  ('N4', 'N4', 'jlpt'),
  ('N3', 'N3', 'jlpt'),
  ('N2', 'N2', 'jlpt'),
  ('N1', 'N1', 'jlpt');

-- Add pack_key column, populate from level, then drop level.
ALTER TABLE "kanji" ADD COLUMN "pack_key" varchar(64);
UPDATE "kanji" SET "pack_key" = "level"::text;
ALTER TABLE "kanji" ALTER COLUMN "pack_key" SET NOT NULL;
ALTER TABLE "kanji"
  ADD CONSTRAINT "kanji_pack_key_fk"
  FOREIGN KEY ("pack_key") REFERENCES "public"."packs"("key")
  ON DELETE cascade ON UPDATE no action;

-- The same kanji character may now appear in multiple packs, so the
-- character-only unique index is replaced by (pack_key, character).
DROP INDEX IF EXISTS "kanji_character_idx";
CREATE UNIQUE INDEX "kanji_pack_character_idx" ON "kanji" ("pack_key", "character");

ALTER TABLE "kanji" DROP COLUMN "level";
DROP TYPE "public"."jlpt_level";
