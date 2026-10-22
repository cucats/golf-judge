import type { RequestHandler } from "./$types";
import type { JudgeProgress } from "#lib/types.js";
import { jobProgress } from "#lib/server/jobs.js";

const headers = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-store",
  "X-Accel-Buffering": "no",
};
const unavailable = (error: string) =>
  new Response(`event: unavailable\ndata: ${JSON.stringify({ error })}\n\n`, {
    headers,
  });

export const GET: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user)
    return unavailable("Please sign in to view your submission.");
  const username = locals.user.username;
  const initial = await jobProgress(params.id, username);
  if (!initial) return unavailable("Submission not found.");
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    clearTimeout(timer);
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let previous = "";
      let heartbeat = Date.now();
      const poll = async (progress?: JudgeProgress) => {
        if (cancelled) return;
        try {
          const current = progress ?? (await jobProgress(params.id, username));
          if (cancelled) return;
          if (!current) {
            controller.enqueue(
              encoder.encode(
                `event: unavailable\ndata: ${JSON.stringify({ error: "Submission no longer exists." })}\n\n`,
              ),
            );
            controller.close();
            cancel();
            return;
          }
          const data = JSON.stringify(current);
          if (data !== previous) {
            controller.enqueue(
              encoder.encode(`event: progress\ndata: ${data}\n\n`),
            );
            previous = data;
          } else if (Date.now() - heartbeat > 10000) {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
            heartbeat = Date.now();
          }
          if (current.state === "finished") {
            controller.close();
            cancel();
            return;
          }
          timer = setTimeout(() => {
            void poll(undefined);
          }, 250);
        } catch (err) {
          if (!cancelled) controller.error(err);
          cancel();
        }
      };
      request.signal.addEventListener("abort", cancel, { once: true });
      void poll(initial);
    },
    cancel,
  });
  return new Response(stream, { headers });
};
