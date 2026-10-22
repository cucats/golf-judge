-- scripts/migrate.mjs converts existing batch graders and case boundaries first.
ALTER TABLE problems ADD COLUMN test_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(test_cases)) STORED;
ALTER TABLE problems DROP COLUMN test_input;
ALTER TABLE problems DROP COLUMN test_output;
ALTER TABLE problems DROP COLUMN public_test_count;
ALTER TABLE problems ADD CONSTRAINT test_cases_array CHECK (jsonb_typeof(test_cases) = 'array');
