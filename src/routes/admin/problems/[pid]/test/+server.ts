import type { RequestHandler } from "./$types";
import { requireAdmin } from "#lib/server/auth.js";
import { problem } from "#lib/server/db.js";
import { normalize } from "#lib/types.js";
import { admit, judge, validateCode } from "#lib/server/runner.js";
import { submissionError } from "#lib/server/submissions.js";
export const POST = async (event: Parameters<RequestHandler>[0]) => {
  const user = requireAdmin(event),
    p = await problem(event.params.pid);
  const code = normalize(
    String((await event.request.formData()).get("code") ?? ""),
  );
  const invalid = validateCode(p, code);
  if (invalid) return submissionError(invalid);
  const done = admit(user.username);
  if (typeof done === "string") return submissionError(done);
  try {
    return Response.json(await judge(p, code));
  } finally {
    done();
  }
};
