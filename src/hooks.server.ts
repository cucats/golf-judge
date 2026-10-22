import type { Handle } from "@sveltejs/kit/hooks";
import { getUser } from "#lib/server/auth.js";
import { pool, query } from "#lib/server/db.js";
import { startJudgeWorkers, stopJudgeWorkers } from "#lib/server/jobs.js";
import { building, dev } from "$app/env";
export function init() {
  if (building) return;
  startJudgeWorkers();
  if (!dev) {
    process.once("SIGTERM", () => {
      void stopJudgeWorkers();
    });
    process.once("SIGINT", () => {
      void stopJudgeWorkers();
    });
    process.once("sveltekit:shutdown", () => {
      void stopJudgeWorkers().then(() => pool.end());
    });
  }
}
let lastExpiry = 0;
export const handle: Handle = async ({ event, resolve }) => {
  if (Date.now() - lastExpiry >= 5000) {
    lastExpiry = Date.now();
    await query(
      "UPDATE contests SET status='ended' WHERE status='active' AND duration>0 AND start_time IS NOT NULL AND $1>=start_time+duration",
      [Math.floor(Date.now() / 1000)],
    );
  }
  event.locals.user = await getUser(event);
  return resolve(event);
};
