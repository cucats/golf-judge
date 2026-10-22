ALTER TABLE problems ADD COLUMN public_test_count INTEGER NOT NULL DEFAULT 0
    CHECK (public_test_count >= 0);
ALTER TABLE problems ADD COLUMN result_mode TEXT NOT NULL DEFAULT 'value'
    CHECK (result_mode IN ('value', 'truthy'));

CREATE TABLE judge_jobs (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    submission_id TEXT UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    problem_snapshot JSONB NOT NULL,
    state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'finished')),
    passed INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    result JSONB,
    lease_token TEXT,
    lease_until BIGINT,
    created_at BIGINT NOT NULL,
    finished_at BIGINT
);
CREATE INDEX judge_jobs_pending ON judge_jobs (state, lease_until, created_at)
    WHERE state <> 'finished';
CREATE INDEX judge_jobs_user_created ON judge_jobs (username, created_at);
