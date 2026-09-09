import * as accounts from "@/domain/accounts";

import { defineRoute } from "_/api";

import { operatorSummaries } from "~/server/accountSummaries";
import type { OperatorSummaryT } from "~/types/views";

/**
 * Hand a disabled operator's collections to another, active operator of the
 * same admin (§2.1.6).
 *
 * The collections keep their ids - which are their API keys - so client
 * projects carry on submitting with no config change, and the mail they were
 * holding resumes under the new owner. Reassignment is invisible from outside.
 */
export default defineRoute<"operators/[id]/reassign", [
  VRefine<string, { format: "uuid" }>,
]>(({ POST }) => [
  POST<{
    json: { targetId: VRefine<string, { format: "uuid" }> };
    response: [200, "json", { operators: Array<OperatorSummaryT> }];
  }>(async (ctx) => {
    accounts.reassign(
      ctx.get("actor"),
      ctx.validated.params.id,
      ctx.validated.json.targetId,
    );

    return ctx.json({ operators: operatorSummaries(ctx.get("admin").id) });
  }),
]);
