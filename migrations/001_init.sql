-- Users table
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL
);

-- Problems table
-- Files expected at: problems/{id}/statement.md, problems/{id}/input.txt, problems/{id}/output.txt
CREATE TABLE IF NOT EXISTS problems (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    created_at BIGINT NOT NULL
);

-- Contests table
CREATE TABLE IF NOT EXISTS contests (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    duration INTEGER NOT NULL,  -- in seconds
    start_time BIGINT,  -- NULL = not started
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'active', 'ended'
    created_at BIGINT NOT NULL
);

-- Contest-Problem junction table
CREATE TABLE IF NOT EXISTS contest_problems (
    contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    problem_order INTEGER NOT NULL,  -- 0, 1, 2... (display order in contest)
    PRIMARY KEY (contest_id, problem_id)
);

CREATE INDEX IF NOT EXISTS idx_contest_problems_contest ON contest_problems(contest_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contest_problem_order ON contest_problems(contest_id, problem_order);

-- Submissions table
CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    verdict TEXT NOT NULL,
    code_length INTEGER NOT NULL,
    time INTEGER NOT NULL,  -- execution time in ms
    code TEXT NOT NULL,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_username ON submissions(username);
CREATE INDEX IF NOT EXISTS idx_submissions_contest ON submissions(contest_id);
CREATE INDEX IF NOT EXISTS idx_submissions_problem ON submissions(problem_id);
CREATE INDEX IF NOT EXISTS idx_submissions_contest_user ON submissions(contest_id, username);
CREATE INDEX IF NOT EXISTS idx_submissions_verdict ON submissions(verdict);
