ALTER TABLE users ADD COLUMN email TEXT;
CREATE UNIQUE INDEX idx_users_email ON users (email) WHERE email IS NOT NULL;

CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT REFERENCES users(username) ON DELETE CASCADE,
    password_hash TEXT,
    code_hash TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_password_resets_expires_at ON password_resets (expires_at);

CREATE TABLE password_reset_limits (
    key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL,
    expires_at BIGINT NOT NULL
);
CREATE INDEX idx_password_reset_limits_expires_at ON password_reset_limits (expires_at);
