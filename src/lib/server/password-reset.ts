import { createHash, randomBytes, randomInt } from "node:crypto";
import { hashPassword } from "./auth.js";
import { one, pool, query } from "./db.js";
import { now } from "#lib/types.js";

export const resetLifetime = 600;
export const resetCookie = "golf_password_reset";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const resetCode = () =>
  Array.from(
    { length: 6 },
    () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[randomInt(36)],
  ).join("");

async function allow(key: string, limit: number) {
  const row = await one<{ attempts: number }>(
    `INSERT INTO password_reset_limits (key,attempts,expires_at) VALUES ($1,1,$2+900)
     ON CONFLICT (key) DO UPDATE SET
       attempts=CASE WHEN password_reset_limits.expires_at<=$2 THEN 1 ELSE password_reset_limits.attempts+1 END,
       expires_at=CASE WHEN password_reset_limits.expires_at<=$2 THEN $2+900 ELSE password_reset_limits.expires_at END
     RETURNING attempts`,
    [hash(key), now()],
  );
  return row!.attempts <= limit;
}

export async function requestReset(
  email: string,
  address: string,
  send: (email: string, code: string) => Promise<void>,
) {
  await query("DELETE FROM password_resets WHERE expires_at<=$1", [now()]);
  await query("DELETE FROM password_reset_limits WHERE expires_at<=$1", [
    now(),
  ]);
  if (
    !(await allow(`ip:${address}`, 20)) ||
    !(await allow(`email:${email}`, 5))
  )
    return null;
  const token = randomBytes(32).toString("hex");
  const code = resetCode();
  const user = await one<{ username: string; password_hash: string }>(
    "SELECT username,password_hash FROM users WHERE email=$1 AND password_hash IS NOT NULL",
    [email],
  );
  await query(
    `INSERT INTO password_resets (token_hash,email,username,password_hash,code_hash,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (email) DO UPDATE SET token_hash=EXCLUDED.token_hash,username=EXCLUDED.username,
       password_hash=EXCLUDED.password_hash,code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,attempts=0,verified=false`,
    [
      hash(token),
      email,
      user?.username ?? null,
      user?.password_hash ?? null,
      hash(`${token}:${code}`),
      now() + resetLifetime,
    ],
  );
  if (user) {
    try {
      await send(email, code);
    } catch {
      // Keep the response identical for registered and unregistered addresses.
      console.error("Password reset email delivery failed");
    }
  }
  return token;
}

export async function resetStage(token: string | undefined) {
  if (!token) return "email" as const;
  const row = await one<{ verified: boolean }>(
    "SELECT verified FROM password_resets WHERE token_hash=$1 AND expires_at>$2 AND (attempts<5 OR verified)",
    [hash(token), now()],
  );
  return row
    ? row.verified
      ? ("password" as const)
      : ("code" as const)
    : ("email" as const);
}

export async function verifyResetCode(token: string | undefined, code: string) {
  if (!token) return false;
  const row = await one<{ verified: boolean }>(
    `UPDATE password_resets SET attempts=attempts+1,verified=(code_hash=$2 AND username IS NOT NULL)
     WHERE token_hash=$1 AND expires_at>$3 AND attempts<5 AND NOT verified RETURNING verified`,
    [hash(token), hash(`${token}:${code}`), now()],
  );
  return row?.verified ?? false;
}

export async function completeReset(
  token: string | undefined,
  password: string,
) {
  if (!token || (await resetStage(token)) !== "password") return null;
  const passwordHash = await hashPassword(password);
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    // Lock the account before the reset, matching the order used by email changes.
    const changed = await tx.query<{ username: string }>(
      `UPDATE users AS u SET password_hash=$2
       FROM password_resets AS r
       WHERE r.token_hash=$1 AND r.verified AND r.expires_at>$3
         AND u.username=r.username AND u.email=r.email AND u.password_hash=r.password_hash
       RETURNING u.username`,
      [hash(token), passwordHash, now()],
    );
    const username = changed.rows[0]?.username;
    if (username) {
      const consumed = await tx.query(
        "DELETE FROM password_resets WHERE token_hash=$1 AND verified AND expires_at>$2 RETURNING token_hash",
        [hash(token), now()],
      );
      if (!consumed.rowCount) {
        await tx.query("ROLLBACK");
        return null;
      }
      await tx.query("DELETE FROM sessions WHERE username=$1", [username]);
      await tx.query("DELETE FROM password_resets WHERE username=$1", [
        username,
      ]);
    }
    await tx.query("COMMIT");
    return username ?? null;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}
