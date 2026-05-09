-- Reading-kind tests get a second sub-pick (meaning) on top of the reading pick.
-- The example sentence is the shared prompt for both. Re-adds the columns
-- dropped in 0010.

ALTER TABLE word_test_items
  ADD COLUMN IF NOT EXISTS picked_reading text,
  ADD COLUMN IF NOT EXISTS is_correct_reading boolean,
  ADD COLUMN IF NOT EXISTS picked_meaning text,
  ADD COLUMN IF NOT EXISTS is_correct_meaning boolean;
