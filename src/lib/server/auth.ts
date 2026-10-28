import { createHash, randomBytes } from "node:crypto";
import { redirect } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import type { Contest, User } from "#lib/types.js";
import { ended, now } from "#lib/types.js";
import { one, query } from "./db.js";
const lifetime = 86400;
const cookie = "golf_session";
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const safeNext = (next: string | null) =>
  next?.startsWith("/") && !next.startsWith("//") && !/[\\\p{Cc}]/u.test(next)
    ? next
    : "/";
export async function getUser(event: RequestEvent): Promise<User | null> {
  const token = event.cookies.get(cookie);
  if (!token) return null;
  const user = await one<User>(
    `UPDATE sessions AS s SET expires_at=GREATEST(s.expires_at,$2::bigint+$3::bigint)
     FROM users AS u
     WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.username=s.username
     RETURNING u.username,u.is_admin`,
    [tokenHash(token), now(), lifetime],
  );
  if (!user) {
    event.cookies.delete(cookie, { path: "/" });
    return null;
  }
  event.cookies.set(cookie, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.INSECURE_COOKIES === undefined,
    maxAge: lifetime,
  });
  return user;
}
export async function logout(event: RequestEvent) {
  const token = event.cookies.get(cookie);
  if (token)
    await query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
  event.cookies.delete(cookie, { path: "/" });
}
export async function login(event: RequestEvent, username: string) {
  await logout(event);
  await query("DELETE FROM sessions WHERE expires_at<=$1", [now()]);
  const token = randomBytes(32).toString("base64url");
  await query(
    "INSERT INTO sessions (token_hash,username,expires_at) VALUES ($1,$2,$3)",
    [tokenHash(token), username, now() + lifetime],
  );
  event.cookies.set(cookie, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.INSECURE_COOKIES === undefined,
    maxAge: lifetime,
  });
}
export function requireUser(event: RequestEvent): User {
  if (!event.locals.user)
    redirect(
      303,
      `/login?next=${encodeURIComponent(event.url.pathname + event.url.search)}`,
    );
  return event.locals.user;
}
export function requireAdmin(event: RequestEvent): User {
  const user = requireUser(event);
  if (!user.is_admin) redirect(303, "/");
  return user;
}
export function problemAccess(c: Contest, event: RequestEvent) {
  if (ended(c)) return;
  const user = requireUser(event);
  if (c.status === "pending" && !user.is_admin)
    redirect(303, `/contest/${c.id}/waiting`);
}
export const hashPassword = (password: string) =>
  Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 19456,
    timeCost: 2,
  });
export async function verifyPassword(hash: string | null, password: string) {
  if (!hash) return false;
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}
export async function authenticate(
  username: string,
  password: string,
  email: string | null = null,
): Promise<string | null> {
  if (!username) return "Username is required";
  if ([...username].length > 32)
    return "Username must be at most 32 characters";
  if (/\p{Cc}/u.test(username)) return "Username contains invalid characters";
  if (!password) return "Password is required";
  let user = await one<{ password_hash: string | null }>(
    "SELECT password_hash FROM users WHERE username=$1",
    [username],
  );
  if (!user) {
    if ([...password].length < 4)
      return "Choose a password of at least 4 characters";
    let created;
    try {
      created = await one<{ username: string }>(
        "INSERT INTO users (username,is_admin,created_at,password_hash,email) VALUES ($1,false,$2,$3,$4) ON CONFLICT (username) DO NOTHING RETURNING username",
        [username, now(), await hashPassword(password), email],
      );
    } catch (error) {
      if ((error as { constraint?: string }).constraint === "idx_users_email")
        return "Email is already in use";
      throw error;
    }
    if (created) return null;
    user = await one<{ password_hash: string | null }>(
      "SELECT password_hash FROM users WHERE username=$1",
      [username],
    );
  }
  return (await verifyPassword(user?.password_hash ?? null, password))
    ? null
    : "Incorrect password for this username";
}
