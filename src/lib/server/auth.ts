import { randomBytes } from 'node:crypto';
import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { Contest, User } from '#lib/types.js';
import { ended, now } from '#lib/types.js';
import { one, query } from './db.js';
const sessions = new Map<string, { username: string; expires: number }>();
const lifetime = 86400;
const cookie = 'golf_session';
export const safeNext = (next: string | null) =>
	next?.startsWith('/') && !next.startsWith('//') && !/[\\\p{Cc}]/u.test(next) ? next : '/';
export async function getUser(event: RequestEvent): Promise<User | null> {
	const token = event.cookies.get(cookie);
	const session = token ? sessions.get(token) : undefined;
	if (!session || session.expires <= now()) {
		if (token) sessions.delete(token);
		return null;
	}
	session.expires = now() + lifetime;
	event.cookies.set(cookie, token!, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.INSECURE_COOKIES === undefined,
		maxAge: lifetime
	});
	return (
		(await one<User>('SELECT username,is_admin FROM users WHERE username=$1', [
			session.username
		])) ?? null
	);
}
export function logout(event: RequestEvent) {
	const token = event.cookies.get(cookie);
	if (token) sessions.delete(token);
	event.cookies.delete(cookie, { path: '/' });
}
export function login(event: RequestEvent, username: string) {
	logout(event);
	for (const [key, session] of sessions) if (session.expires <= now()) sessions.delete(key);
	const token = randomBytes(32).toString('base64url');
	sessions.set(token, { username, expires: now() + lifetime });
	event.cookies.set(cookie, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.INSECURE_COOKIES === undefined,
		maxAge: lifetime
	});
}
export function requireUser(event: RequestEvent): User {
	if (!event.locals.user)
		redirect(303, `/login?next=${encodeURIComponent(event.url.pathname + event.url.search)}`);
	return event.locals.user;
}
export function requireAdmin(event: RequestEvent): User {
	const user = requireUser(event);
	if (!user.is_admin) redirect(303, '/');
	return user;
}
export function problemAccess(c: Contest, event: RequestEvent) {
	if (ended(c)) return;
	const user = requireUser(event);
	if (c.status === 'pending' && !user.is_admin) redirect(303, `/contest/${c.id}/waiting`);
}
export const hashPassword = (password: string) =>
	Bun.password.hash(password, { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 });
export async function verifyPassword(hash: string | null, password: string) {
	if (!hash) return false;
	try {
		return await Bun.password.verify(password, hash);
	} catch {
		return false;
	}
}
export async function authenticate(username: string, password: string): Promise<string | null> {
	if (!username) return 'Username is required';
	if ([...username].length > 32) return 'Username must be at most 32 characters';
	if (/\p{Cc}/u.test(username)) return 'Username contains invalid characters';
	if (!password) return 'Password is required';
	await query(
		'INSERT INTO users (username,is_admin,created_at) VALUES ($1,false,$2) ON CONFLICT DO NOTHING',
		[username, now()]
	);
	const user = (await one<User & { password_hash: string | null }>(
		'SELECT username,is_admin,password_hash FROM users WHERE username=$1',
		[username]
	))!;
	if (user.password_hash)
		return (await verifyPassword(user.password_hash, password))
			? null
			: 'Incorrect password for this username';
	if ([...password].length < 4) return 'Choose a password of at least 4 characters';
	const claimed = await query(
		'UPDATE users SET password_hash=$2 WHERE username=$1 AND password_hash IS NULL AND NOT is_admin RETURNING username',
		[username, await hashPassword(password)]
	);
	return claimed.length ? null : 'Incorrect password for this username';
}
