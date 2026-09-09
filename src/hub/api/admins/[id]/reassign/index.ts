import * as accounts from "@/domain/accounts";

import { defineRoute } from "_/api";

import { adminSummaries } from "~/server/accountSummaries";
import type { AdminSummaryT } from "~/types/views";

/**
 * Hand a disabled admin's operators and providers to another, active admin
 * (§2.1.6).
 *
 * They move together, on purpose: the collections underneath keep pointing at
 * the providers they were already sending through, and those providers land
 * under the same new admin - so the "a collection's provider belongs to its
 * admin" invariant survives the move. Name collisions are resolved on arrival;
 * two providers are never silently merged into one.
 */
export default defineRoute<"admins/[id]/reassign", [
  VRefine<string, { format: "uuid" }>,
]>(({ POST }) => [
  POST<{
    json: { targetId: VRefine<string, { format: "uuid" }> };
    response: [200, "json", { admins: Array<AdminSummaryT> }];
  }>(async (ctx) => {
    accounts.reassign(
      ctx.get("actor"),
      ctx.validated.params.id,
      ctx.validated.json.targetId,
    );

    return ctx.json({ admins: adminSummaries() });
  }),
]);
