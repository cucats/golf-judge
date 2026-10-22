import { query, contestProblems } from './db.js';
import type { Board, ContestProblem, Entry } from '#lib/types.js';
interface Best {
	username: string;
	problem_id: number;
	code_length: number;
}
export function compute(problems: ContestProblem[], participants: string[], best: Best[]): Board {
	const cols = new Map(problems.map((p, i) => [p.id, i]));
	const shortest = new Map<number, { bytes: number; holders: number }>();
	for (const row of best) {
		if (!cols.has(row.problem_id)) continue;
		const old = shortest.get(row.problem_id);
		if (!old || row.code_length < old.bytes)
			shortest.set(row.problem_id, { bytes: row.code_length, holders: 1 });
		else if (row.code_length === old.bytes) old.holders++;
	}
	const entries = new Map<string, Entry>();
	function entry(username: string) {
		let e = entries.get(username);
		if (!e) {
			e = {
				username,
				rank: 0,
				total_bytes: 0,
				problems_solved: 0,
				problem_results: problems.map(() => null)
			};
			entries.set(username, e);
		}
		return e;
	}
	participants.forEach(entry);
	for (const row of best) {
		const col = cols.get(row.problem_id);
		if (col === undefined) continue;
		const e = entry(row.username),
			shortestResult = shortest.get(row.problem_id)!;
		e.problem_results[col] = {
			code_length: row.code_length,
			medal:
				row.code_length === shortestResult.bytes
					? shortestResult.holders === 1
						? 'diamond'
						: 'gold'
					: 'none'
		};
		e.problems_solved++;
		e.total_bytes += row.code_length;
	}
	const sorted = [...entries.values()].sort(
		(a, b) =>
			b.problems_solved - a.problems_solved ||
			a.total_bytes - b.total_bytes ||
			(a.username < b.username ? -1 : a.username > b.username ? 1 : 0)
	);
	sorted.forEach(
		(e, i) =>
			(e.rank =
				i &&
				e.problems_solved === sorted[i - 1].problems_solved &&
				e.total_bytes === sorted[i - 1].total_bytes
					? sorted[i - 1].rank
					: i + 1)
	);
	return { problems, entries: sorted };
}
export async function leaderboard(cid: number): Promise<Board> {
	const [problems, participants, best] = await Promise.all([
		contestProblems(cid),
		query<{ username: string }>('SELECT username FROM contest_participants WHERE contest_id=$1', [
			cid
		]),
		query<Best>(
			"SELECT username,problem_id,MIN(code_length) AS code_length FROM submissions WHERE contest_id=$1 AND verdict='AC' GROUP BY username,problem_id",
			[cid]
		)
	]);
	return compute(
		problems,
		participants.map((p) => p.username),
		best
	);
}
