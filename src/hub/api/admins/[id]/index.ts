import * as accounts from "@/domain/accounts";

import { defineRoute } from "_/api";

/**
 * Delete an admin (§2.1.6) - only once it is disabled and holds no operators
 * and no providers. Anything else is refused with a conflict: reassign first.
 */
export default defineRoute<"admins/[id]", [
  VRefine<string, { format: "uuid" }>,
]>(({ DELETE }) => [
  DELETE<{
    response: [200, "json", { ok: true }];
  }>(async (ctx) => {
    accounts.remove(ctx.get("actor"), ctx.validated.params.id);
    return ctx.json({ ok: true } as const);
  }),
]);
