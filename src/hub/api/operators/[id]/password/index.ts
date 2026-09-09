import * as accounts from "@/domain/accounts";

import { defineRoute } from "_/api";

/**
 * Reset an operator's password (§2.1.2).
 *
 * An administrative reset, deliberately outside the confirmation gate of
 * §2.1.7: it is the recovery path for an account that cannot complete that
 * gate. It ends the operator's sessions, since the credential they were
 * holding is no longer current.
 */
export default defineRoute<"operators/[id]/password", [
  VRefine<string, { format: "uuid" }>,
]>(({ PUT }) => [
  PUT<{
    json: { password: VRefine<string, { minLength: 10, maxLength: 512 }> };
    response: [200, "json", { ok: true }];
  }>(async (ctx) => {
    await accounts.resetPassword(
      ctx.get("actor"),
      ctx.validated.params.id,
      ctx.validated.json.password,
    );

    return ctx.json({ ok: true } as const);
  }),
]);
