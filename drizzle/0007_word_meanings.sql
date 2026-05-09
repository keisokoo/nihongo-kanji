ALTER TABLE "words" ADD COLUMN "meanings_ko" jsonb NOT NULL DEFAULT '[]'::jsonb;
