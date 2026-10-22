import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { requireUser, login, hashPassword, verifyPassword } from '#lib/server/auth.js';
import { one, query } from '#lib/server/db.js';
export const load = (event: Parameters<PageServerLoad>[0]) => {
	requireUser(event);
	return {};
};
export const actions = {
	default: async (event: Parameters<Actions[string]>[0]) => {
		const user = requireUser(event),
			f = await event.request.formData();
		const current = String(f.get('current_password') ?? ''),
			password = String(f.get('new_password') ?? '');
		if (!current) return fail(400, { error: 'Current password is required' });
		if ([...password].length < 4)
			return fail(400, { error: 'Choose a password of at least 4 characters' });
		if (password !== f.get('confirm_password'))
			return fail(400, { error: 'New passwords do not match' });
		const stored = await one<{ password_hash: string }>(
			'SELECT password_hash FROM users WHERE username=$1',
			[user.username]
		);
		if (!stored || !(await verifyPassword(stored.password_hash, current)))
			return fail(400, { error: 'Incorrect current password' });
		const changed = await query(
			'UPDATE users SET password_hash=$2 WHERE username=$1 AND password_hash=$3 RETURNING username',
			[user.username, await hashPassword(password), stored.password_hash]
		);
		if (!changed.length)
			return fail(400, { error: 'Password changed in another session. Please try again.' });
		login(event, user.username);
		return { changed: true };
	}
};
