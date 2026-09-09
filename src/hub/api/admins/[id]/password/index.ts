import * as accounts from "@/domain/accounts";

import { defineRoute } from "_/api";

/**
 * Reset an admin's password (§2.1.1) - the recovery path when an admin cannot
 * complete the confirmation gate, and the reason self-service password
 * recovery is out of scope (§7).
 */
export default defineRoute<"admins/[id]/password", [
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
