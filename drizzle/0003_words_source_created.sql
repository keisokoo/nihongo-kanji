ALTER TABLE "words"
  ADD COLUMN "source" "example_source" NOT NULL DEFAULT 'seed';

ALTER TABLE "words"
  ADD COLUMN "created_at" timestamp NOT NULL DEFAULT now();
