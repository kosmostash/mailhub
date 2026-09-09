import * as accounts from "@/domain/accounts";

import { defineRoute } from "_/api";

/**
 * Delete an operator (§2.1.6).
 *
 * Offered only once the account is disabled and holds no collections; the
 * domain refuses anything else with a conflict telling the caller to reassign
 * first. Deleting takes the account's test addresses with it and leaves the
 * activity trail exactly as it was.
 */
export default defineRoute<"operators/[id]", [
  VRefine<string, { format: "uuid" }>,
]>(({ DELETE }) => [
  DELETE<{
    response: [200, "json", { ok: true }];
  }>(async (ctx) => {
    accounts.remove(ctx.get("actor"), ctx.validated.params.id);
    return ctx.json({ ok: true } as const);
  }),
]);
