-- Store problem statements and test cases in database instead of files

-- Add statement and test data columns to problems
ALTER TABLE problems
ADD COLUMN statement TEXT NOT NULL DEFAULT '',
ADD COLUMN test_input TEXT NOT NULL DEFAULT '',
ADD COLUMN test_output TEXT NOT NULL DEFAULT '';
