import * as accounts from "@/domain/accounts";
import * as sessions from "@/domain/sessions";

import { defineRoute } from "_/api";

import { clearSessionCookie, setSessionCookie } from "~/server/cookies";
import { type SessionViewT, actorView } from "~/types/views";

/**
 * Sign-in, sign-out, and "who am I" (§5.1).
 *
 * One shape answers all three, and it carries `needsBootstrap` as well, so the
 * app knows on its first request whether to show a sign-in form or propose
 * creating the superadmin (§2.1.4).
 */
const view = (actor: Parameters<typeof actorView>[0] | undefined): SessionViewT => ({
  actor: actor ? actorView(actor) : null,
  needsBootstrap: !accounts.superadminExists(),
});

export default defineRoute<"session">(({ GET, POST, DELETE }) => [
  GET<{
    response: [200, "json", SessionViewT];
  }>(async (ctx) => {
    // Public: a signed-out browser asks this on load and gets `actor: null`.
    return ctx.json(view(ctx.get("actor")));
  }),

  POST<{
    json: {
      email: VRefine<string, { format: "email", maxLength: 320 }>;
      password: VRefine<string, { minLength: 1, maxLength: 512 }>;
    };
    response: [200, "json", SessionViewT];
  }>(async (ctx) => {
    const { email, password } = ctx.validated.json;

    // Throws 401 on bad credentials and 403 on a disabled account - including
    // an operator whose admin is disabled (§2.1.5).
    const token = await sessions.signIn(email, password);
    setSessionCookie(ctx, token);

    return ctx.json(view(sessions.resolve(token)));
  }),

  DELETE<{
    response: [200, "json", SessionViewT];
  }>(async (ctx) => {
    const actor = ctx.get("actor");
    if (actor) sessions.revoke(actor.session.id);
    clearSessionCookie(ctx);

    return ctx.json(view(undefined));
  }),
]);
