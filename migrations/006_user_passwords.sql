-- Contestants set a password on their first login; NULL means the
-- username has not been claimed yet
ALTER TABLE users ADD COLUMN password_hash TEXT;
