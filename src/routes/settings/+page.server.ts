import type { PageServerLoad, Actions } from "./$types";
import { fail, redirect } from "@sveltejs/kit";
import { requireUser } from "#lib/server/auth.js";
import { normalizeEmail, validEmail } from "#lib/server/email.js";
import { one, pool } from "#lib/server/db.js";

export const load = async (event: Parameters<PageServerLoad>[0]) => {
  const user = requireUser(event);
  const account = await one<{ email: string | null }>(
    "SELECT email FROM users WHERE username=$1",
    [user.username],
  );
  return { email: account?.email ?? "" };
};

export const actions = {
  default: async (event: Parameters<Actions[string]>[0]) => {
    const user = requireUser(event);
    const form = await event.request.formData();
    const email = normalizeEmail(String(form.get("email") ?? ""));
    if (email && !validEmail(email))
      return fail(400, { error: "Invalid email", email });
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      const changed = await tx.query(
        "UPDATE users SET email=$2 WHERE username=$1 AND email IS DISTINCT FROM $2 RETURNING username",
        [user.username, email || null],
      );
      if (changed.rowCount)
        await tx.query("DELETE FROM password_resets WHERE username=$1", [
          user.username,
        ]);
      await tx.query("COMMIT");
    } catch (error) {
      await tx.query("ROLLBACK");
      if ((error as { constraint?: string }).constraint === "idx_users_email")
        return fail(400, { error: "Email is already in use", email });
      throw error;
    } finally {
      tx.release();
    }
    redirect(303, "/settings");
  },
};
