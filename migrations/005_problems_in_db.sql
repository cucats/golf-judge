-- Move problems from the filesystem into the database so they can be
-- authored in the admin UI. Existing filesystem problems are referenced by
-- legacy_id and have their content filled in by the importer at startup.

CREATE TABLE problems (
    id SERIAL PRIMARY KEY,
    legacy_id TEXT UNIQUE,
    title TEXT NOT NULL,
    statement TEXT NOT NULL DEFAULT '',
    test_input TEXT NOT NULL DEFAULT '',
    test_output TEXT NOT NULL DEFAULT '',
    grader TEXT NOT NULL DEFAULT '',
    time_limit_ms INTEGER NOT NULL DEFAULT 1000,
    memory_limit_kb INTEGER NOT NULL DEFAULT 262144,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- Placeholder rows for every problem already referenced by a contest or submission
INSERT INTO problems (legacy_id, title, created_at, updated_at)
SELECT problem_id, 'Problem ' || problem_id, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT
FROM (
    SELECT problem_id FROM contest_problems
    UNION
    SELECT problem_id FROM submissions
) referenced;

-- contest_problems.problem_id: TEXT -> INTEGER FK
ALTER TABLE contest_problems ADD COLUMN new_problem_id INTEGER;
UPDATE contest_problems cp SET new_problem_id = p.id FROM problems p WHERE p.legacy_id = cp.problem_id;
ALTER TABLE contest_problems DROP COLUMN problem_id;
ALTER TABLE contest_problems RENAME COLUMN new_problem_id TO problem_id;
ALTER TABLE contest_problems ALTER COLUMN problem_id SET NOT NULL;
ALTER TABLE contest_problems ADD PRIMARY KEY (contest_id, problem_id);
ALTER TABLE contest_problems
    ADD CONSTRAINT contest_problems_problem_id_fkey
    FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE RESTRICT;

-- submissions.problem_id: TEXT -> INTEGER FK
ALTER TABLE submissions ADD COLUMN new_problem_id INTEGER;
UPDATE submissions s SET new_problem_id = p.id FROM problems p WHERE p.legacy_id = s.problem_id;
ALTER TABLE submissions DROP COLUMN problem_id;
ALTER TABLE submissions RENAME COLUMN new_problem_id TO problem_id;
ALTER TABLE submissions ALTER COLUMN problem_id SET NOT NULL;
ALTER TABLE submissions
    ADD CONSTRAINT submissions_problem_id_fkey
    FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE RESTRICT;
CREATE INDEX idx_submissions_problem ON submissions(problem_id);
CREATE INDEX idx_submissions_contest_problem ON submissions(contest_id, problem_id);

-- Timestamps elsewhere are BIGINT; INTEGER overflows in 2038
ALTER TABLE contest_participants ALTER COLUMN joined_at TYPE BIGINT;
