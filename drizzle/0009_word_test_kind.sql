CREATE TYPE "word_test_kind" AS ENUM ('meaning', 'reading');

ALTER TABLE "word_tests"
  ADD COLUMN "kind" word_test_kind NOT NULL DEFAULT 'meaning';

ALTER TABLE "word_test_items"
  ALTER COLUMN "mode" DROP NOT NULL,
  ADD COLUMN "picked_reading" text,
  ADD COLUMN "is_correct_reading" boolean,
  ADD COLUMN "picked_meaning" text,
  ADD COLUMN "is_correct_meaning" boolean;
