import * as testAddresses from "@/domain/testAddresses";

import { defineRoute } from "_/api";

/**
 * Remove a test address (§2.5). Personal data: it belongs to the account, not
 * to its collections, so it never moves on reassignment and goes with the
 * account when it is deleted.
 */
export default defineRoute<"account/test-addresses/[id]", [
  VRefine<string, { format: "uuid" }>,
]>(({ DELETE }) => [
  DELETE<{
    response: [200, "json", { ok: true }];
  }>(async (ctx) => {
    testAddresses.remove(ctx.get("actor"), ctx.validated.params.id);
    return ctx.json({ ok: true } as const);
  }),
]);
