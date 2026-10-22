import type { RequestHandler } from "./$types";
import { requireAdmin } from "#lib/server/auth.js";
import { problem } from "#lib/server/db.js";
import { normalize } from "#lib/types.js";
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
  return enqueue(user.username, p, code);
};
