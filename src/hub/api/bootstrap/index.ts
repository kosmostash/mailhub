import * as accounts from "@/domain/accounts";
import * as sessions from "@/domain/sessions";

import { defineRoute } from "_/api";

import { setSessionCookie } from "~/server/cookies";
import { type SessionViewT, actorView } from "~/types/views";

/**
 * First-run bootstrap (§2.1.4).
 *
 * While no superadmin exists the app proposes creating one; this creates it
 * and signs it in. As soon as it exists the proposal never appears again, and
 * the partial unique index on the superadmin row means no second one can ever
 * be created - whatever races this endpoint.
 */
export default defineRoute<"bootstrap">(({ POST }) => [
  POST<{
    json: {
      email: VRefine<string, { format: "email", maxLength: 320 }>;
      password: VRefine<string, { minLength: 10, maxLength: 512 }>;
    };
    response: [201, "json", SessionViewT];
  }>(async (ctx) => {
    const { email, password } = ctx.validated.json;

    const superadmin = await accounts.createSuperadmin({ email, password });

    // Straight in, with no second trip through the sign-in form.
    const token = sessions.signInDirect(superadmin);
    setSessionCookie(ctx, token);

    return ctx.json(
      { actor: actorView(sessions.resolve(token)!), needsBootstrap: false },
      201,
    );
  }),
]);
