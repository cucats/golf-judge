import type { PageServerLoad, Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { contest, query } from '#lib/server/db.js';
import { leaderboard } from '#lib/server/leaderboard.js';
import { ended } from '#lib/types.js';
import type { Submission } from '#lib/types.js';
export const load = async (event: Parameters<PageServerLoad>[0]) => {
	const c = await contest(event.params.id);
	if (!ended(c) && !event.locals.user?.is_admin) redirect(303, `/contest/${c.id}/leaderboard`);
	const board = await leaderboard(c.id),
		user = event.url.searchParams.get('user');
	const entry = board.entries.find((e) => e.username === user);
	if (!entry) error(404, 'Player not found');
	const submissions = await query<Submission>(
		'SELECT * FROM submissions WHERE contest_id=$1 AND username=$2 ORDER BY created_at,id',
		[c.id, user]
	);
	return {
		contest: c,
		entry,
		playerCount: board.entries.length,
		problems: board.problems,
		submissions,
		selected: Number(event.url.searchParams.get('problem')) || null
	};
};
