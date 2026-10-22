import type { RequestEvent } from "@sveltejs/kit";
import { accepting, normalize } from "#lib/types.js";
import type { SubmissionView } from "#lib/types.js";
import { contest, inContest, id, query } from "./db.js";
import { validateCode } from "./runner.js";
import { enqueue } from "./jobs.js";
export const submissionError = (error: string, status = 400) =>
  Response.json({ error }, { status });
export async function submit(event: RequestEvent) {
  const user = event.locals.user;
  if (!user) return submissionError("Not logged in", 401);
  const c = await contest(id(event.params.id));
  if (!accepting(c))
    return submissionError(
      c.status === "pending" ? "Contest has not started" : "Contest has ended",
    );
  const p = await inContest(c.id, id(event.params.pid));
  const code = normalize(
    String((await event.request.formData()).get("code") ?? ""),
  );
  const invalid = validateCode(p, code);
  if (invalid) return submissionError(invalid);
  return enqueue(user.username, p, code, c.id);
}
export function submissions(cid: number, search: URLSearchParams) {
  const values: unknown[] = [cid];
  let sql =
    "SELECT s.*,cp.problem_order,p.title AS problem_title FROM submissions s JOIN problems p ON p.id=s.problem_id LEFT JOIN contest_problems cp ON cp.contest_id=s.contest_id AND cp.problem_id=s.problem_id WHERE s.contest_id=$1";
  for (const [key, column] of [
    ["username", "username"],
    ["verdict", "verdict"],
    ["problem", "problem_id"],
  ]) {
    const value = search.get(key);
    if (!value) continue;
    if (
      key === "problem" &&
      (!/^\d+$/.test(value) || Number(value) > 2147483647)
    )
      continue;
    values.push(value);
    sql += ` AND s.${column}=$${values.length}`;
  }
  return query<SubmissionView>(
    sql + " ORDER BY s.created_at DESC,s.id",
    values,
  );
}
