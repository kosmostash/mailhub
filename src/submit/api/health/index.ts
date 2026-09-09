import { db } from "@/db";

import { defineRoute } from "_/api";

type HealthViewT = {
  status: "ok";
  storage: "ok";
};

/**
 * Liveness - `GET /api/health` (§3.5).
 *
 * 200 when the service *and its storage* respond, so it touches the database
 * rather than answering from the web layer alone: a process that cannot reach
 * its store is not alive for any purpose MailHub has.
 *
 * No credential: this route sits outside `emails/use.ts` for that reason.
 */
export default defineRoute<"health">(({ GET }) => [
  GET<{
    response: [200, "json", HealthViewT];
  }>(async (ctx) => {
    db().prepare("SELECT 1").get();
    return ctx.json({ status: "ok", storage: "ok" } as const);
  }),
]);
