import type { Handle } from '@sveltejs/kit/hooks';
import { getUser } from '#lib/server/auth.js';
import { query } from '#lib/server/db.js';
let lastExpiry = 0;
export const handle: Handle = async ({ event, resolve }) => {
	if (Date.now() - lastExpiry >= 5000) {
		lastExpiry = Date.now();
		await query(
			"UPDATE contests SET status='ended' WHERE status='active' AND duration>0 AND start_time IS NOT NULL AND $1>=start_time+duration",
			[Math.floor(Date.now() / 1000)]
		);
	}
	event.locals.user = await getUser(event);
	return resolve(event);
};
