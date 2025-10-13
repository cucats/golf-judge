-- Track contest participants
CREATE TABLE IF NOT EXISTS contest_participants (
    contest_id INTEGER NOT NULL REFERENCES contests(id),
    username TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (contest_id, username)
);

CREATE INDEX idx_contest_participants_contest ON contest_participants(contest_id);
CREATE INDEX idx_contest_participants_username ON contest_participants(username);
