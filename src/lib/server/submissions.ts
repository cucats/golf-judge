import { randomBytes } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { accepting, normalize, now } from '#lib/types.js';
import type { SubmissionView } from '#lib/types.js';
import { contest, inContest, id, query, participate } from './db.js';
import { admit, judge, validateCode } from './runner.js';
export const submissionError = (output: string) =>
	Response.json({ verdict: 'ERROR', code_length: 0, time: 0, output });
export async function submit(event: RequestEvent) {
	const user = event.locals.user;
	if (!user) return submissionError('Not logged in');
	const c = await contest(id(event.params.id));
	if (!accepting(c))
		return submissionError(
			c.status === 'pending' ? 'Contest has not started' : 'Contest has ended'
		);
	const p = await inContest(c.id, id(event.params.pid));
	const code = normalize(String((await event.request.formData()).get('code') ?? ''));
	const invalid = validateCode(p, code);
	if (invalid) return submissionError(invalid);
	const done = admit(user.username);
	if (typeof done === 'string') return submissionError(done);
	try {
		// Deliberately independent of request.signal: disconnected clients still get their submission recorded.
		const result = await judge(p, code);
		await participate(c.id, user.username);
		await query(
			'INSERT INTO submissions (id,username,contest_id,problem_id,verdict,code_length,time,code,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
			[
				randomBytes(16).toString('base64url'),
				user.username,
				c.id,
				p.id,
				result.verdict,
				result.code_length,
				result.time,
				code,
				now()
			]
		);
		return Response.json(result);
	} finally {
		done();
	}
}
export function submissions(cid: number, search: URLSearchParams) {
	const values: unknown[] = [cid];
	let sql =
		'SELECT s.*,cp.problem_order,p.title AS problem_title FROM submissions s JOIN problems p ON p.id=s.problem_id LEFT JOIN contest_problems cp ON cp.contest_id=s.contest_id AND cp.problem_id=s.problem_id WHERE s.contest_id=$1';
	for (const [key, column] of [
		['username', 'username'],
		['verdict', 'verdict'],
		['problem', 'problem_id']
	]) {
		const value = search.get(key);
		if (!value) continue;
		if (key === 'problem' && (!/^\d+$/.test(value) || Number(value) > 2147483647)) continue;
		values.push(value);
		sql += ` AND s.${column}=$${values.length}`;
	}
	return query<SubmissionView>(sql + ' ORDER BY s.created_at DESC,s.id', values);
}
