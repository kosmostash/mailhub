import * as sessions from "@/domain/sessions";

import { defineRoute } from "_/api";

import { type SessionViewT, actorView } from "~/types/views";

/**
 * Enter and leave impersonation (§2.2).
 *
 * The rules are the domain's: an admin reaches their own operators, the
 * superadmin reaches any admin or operator, nobody nests, and every
 * state-changing action taken afterwards is recorded against the assumed
 * identity *and* marked as performed by whoever assumed it.
 *
 * Both directions answer with the session as it now stands, so the UI updates
 * its banner and its controls from the response rather than guessing.
 */
export default defineRoute<"impersonation">(({ POST, DELETE }) => [
  POST<{
    json: { userId: VRefine<string, { format: "uuid" }> };
    response: [200, "json", SessionViewT];
  }>(async (ctx) => {
    const assumed = sessions.start(ctx.get("actor"), ctx.validated.json.userId);
    return ctx.json({ actor: actorView(assumed), needsBootstrap: false });
  }),

  DELETE<{
    response: [200, "json", SessionViewT];
  }>(async (ctx) => {
    const own = sessions.end(ctx.get("actor"));
    return ctx.json({ actor: actorView(own), needsBootstrap: false });
  }),
]);
