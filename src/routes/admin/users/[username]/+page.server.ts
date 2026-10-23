import type { PageServerLoad, Actions } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { hashPassword, login, requireAdmin } from "#lib/server/auth.js";
import { one, pool } from "#lib/server/db.js";

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  const account = await one<{ username: string }>(
    "SELECT username FROM users WHERE username=$1",
    [event.params.username],
  );
  if (!account) error(404, "User not found");
  return { account };
};

export const actions = {
  default: async (event: Parameters<Actions[string]>[0]) => {
    const admin = requireAdmin(event);
    const form = await event.request.formData();
    const password = String(form.get("new_password") ?? "");
    if ([...password].length < 4)
      return fail(400, { error: "Choose a password of at least 4 characters" });
    if (password !== form.get("confirm_password"))
      return fail(400, { error: "New passwords do not match" });
    const hash = await hashPassword(password);
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      const changed = await tx.query(
        "UPDATE users SET password_hash=$2 WHERE username=$1 RETURNING username",
        [event.params.username, hash],
      );
      if (!changed.rowCount) error(404, "User not found");
      await tx.query("DELETE FROM sessions WHERE username=$1", [
        event.params.username,
      ]);
      await tx.query("COMMIT");
    } catch (err) {
      await tx.query("ROLLBACK");
      throw err;
    } finally {
      tx.release();
    }
    if (event.params.username === admin.username)
      await login(event, admin.username);
    return { changed: true };
  },
};
