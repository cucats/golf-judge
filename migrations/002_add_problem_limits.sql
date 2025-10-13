-- Add time and memory limits to problems table
ALTER TABLE problems
ADD COLUMN time_limit_secs REAL NOT NULL DEFAULT 2.0,
ADD COLUMN memory_limit_kb INTEGER NOT NULL DEFAULT 256000;
