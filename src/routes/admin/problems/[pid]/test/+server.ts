import type { RequestHandler } from "./$types";
import { requireAdmin } from "#lib/server/auth.js";
import { problem, query } from "#lib/server/db.js";
import { normalize, now } from "#lib/types.js";
import { validateCode } from "#lib/server/runner.js";
import { enqueue } from "#lib/server/jobs.js";
import { submissionError } from "#lib/server/submissions.js";
export const POST = async (event: Parameters<RequestHandler>[0]) => {
  const user = requireAdmin(event),
    p = await problem(event.params.pid);
  const code = normalize(
    String((await event.request.formData()).get("code") ?? ""),
  );
  const invalid = validateCode(p, code);
  if (invalid) return submissionError(invalid);
  await query("UPDATE problems SET solution=$1,updated_at=$2 WHERE id=$3", [
    code,
    now(),
    p.id,
  ]);
  p.solution = code;
  return enqueue(user.username, p, code);
};
