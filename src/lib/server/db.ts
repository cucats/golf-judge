import pg from 'pg';
import { error } from '@sveltejs/kit';
import type { Contest, ContestProblem, Problem, ProblemSummary } from '#lib/types.js';
pg.types.setTypeParser(20, Number);
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
pool.on('error', (err) => console.error('Database connection error', err.message));
export async function query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
	return (await pool.query(sql, values)).rows as T[];
}
export async function one<T>(sql: string, values: unknown[] = []): Promise<T | undefined> {
	return (await query<T>(sql, values))[0];
}
export function id(value: string | undefined): number {
	const n = Number(value);
	if (!value || !Number.isInteger(n) || n < 1 || n > 2147483647) error(404, 'Not found');
	return n;
}
export async function contest(value: string | number): Promise<Contest> {
	const row = await one<Contest>('SELECT * FROM contests WHERE id=$1', [
		typeof value === 'number' ? value : id(value)
	]);
	if (!row) error(404, 'Contest not found');
	return row;
}
export async function problem(value: string | number): Promise<Problem> {
	const row = await one<Problem>('SELECT * FROM problems WHERE id=$1', [
		typeof value === 'number' ? value : id(value)
	]);
	if (!row) error(404, 'Problem not found');
	return row;
}
export const contestProblems = (cid: number) =>
	query<ContestProblem>(
		'SELECT p.id,p.title,cp.problem_order FROM contest_problems cp JOIN problems p ON p.id=cp.problem_id WHERE cp.contest_id=$1 ORDER BY cp.problem_order',
		[cid]
	);
export const problemBank = () =>
	query<ProblemSummary>(
		'SELECT p.id,p.title,(SELECT COUNT(*) FROM contest_problems cp WHERE cp.problem_id=p.id) AS contest_count,(SELECT COUNT(*) FROM submissions s WHERE s.problem_id=p.id) AS submission_count FROM problems p ORDER BY p.id'
	);
export async function inContest(cid: number, pid: number) {
	const row = await one<Problem & { problem_order: number }>(
		'SELECT p.*,cp.problem_order FROM problems p JOIN contest_problems cp ON cp.problem_id=p.id WHERE cp.contest_id=$1 AND p.id=$2',
		[cid, pid]
	);
	if (!row) error(404, 'Problem not found in this contest');
	return row;
}
export const participate = (cid: number, username: string) =>
	query(
		'INSERT INTO contest_participants (contest_id,username,joined_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
		[cid, username, Math.floor(Date.now() / 1000)]
	);
