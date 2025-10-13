-- Remove problems table and update references to use filesystem identifiers

-- Drop existing foreign keys and tables
DROP TABLE IF EXISTS contest_problems CASCADE;
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS problems CASCADE;

-- Recreate contest_problems with string problem identifier
CREATE TABLE contest_problems (
    contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    problem_id TEXT NOT NULL,  -- Filesystem identifier like "0", "1", "2", etc.
    problem_order INTEGER NOT NULL,  -- 0, 1, 2... (display order in contest)
    PRIMARY KEY (contest_id, problem_id)
);

CREATE INDEX idx_contest_problems_contest ON contest_problems(contest_id);
CREATE UNIQUE INDEX idx_contest_problem_order ON contest_problems(contest_id, problem_order);

-- Recreate submissions with string problem identifier
CREATE TABLE submissions (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    problem_id TEXT NOT NULL,  -- Filesystem identifier like "0", "1", "2", etc.
    verdict TEXT NOT NULL,
    code_length INTEGER NOT NULL,
    time INTEGER NOT NULL,  -- execution time in ms
    code TEXT NOT NULL,
    created_at BIGINT NOT NULL
);

CREATE INDEX idx_submissions_username ON submissions(username);
CREATE INDEX idx_submissions_contest ON submissions(contest_id);
CREATE INDEX idx_submissions_problem ON submissions(problem_id);
CREATE INDEX idx_submissions_contest_user ON submissions(contest_id, username);
CREATE INDEX idx_submissions_verdict ON submissions(verdict);
