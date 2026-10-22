ALTER TABLE problems DROP COLUMN result_mode;
UPDATE judge_jobs SET problem_snapshot = problem_snapshot - 'result_mode'
WHERE problem_snapshot ? 'result_mode';
