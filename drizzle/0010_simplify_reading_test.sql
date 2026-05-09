-- Reading-kind tests redesigned to a single pick (the word reading) prompted
-- by the source word's example sentence. The previous two-sub-pick model is
-- dropped; existing reading tests are removed since the schema and prompt
-- shape changed.

DELETE FROM word_tests WHERE kind = 'reading';

ALTER TABLE word_test_items
  DROP COLUMN IF EXISTS picked_reading,
  DROP COLUMN IF EXISTS is_correct_reading,
  DROP COLUMN IF EXISTS picked_meaning,
  DROP COLUMN IF EXISTS is_correct_meaning;
