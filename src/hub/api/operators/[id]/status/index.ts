import * as accounts from "@/domain/accounts";

import { defineRoute } from "_/api";

import { operatorSummaries } from "~/server/accountSummaries";
import type { OperatorSummaryT } from "~/types/views";

/**
 * Disable or re-enable an operator (§2.1.5).
 *
 * Disabling bites immediately: the operator's sessions are revoked, their
 * collections stop accepting submissions (403, distinguishable from an unknown
 * id) and the background sender skips their mail. Nothing is deleted or moved.
 * Re-enabling lifts all of it and held mail resumes where it stopped.
 */
export default defineRoute<"operators/[id]/status", [
  VRefine<string, { format: "uuid" }>,
]>(({ PUT }) => [
  PUT<{
    json: { disabled: boolean };
    response: [200, "json", OperatorSummaryT];
  }>(async (ctx) => {
    const operator = accounts.setDisabled(
      ctx.get("actor"),
      ctx.validated.params.id,
      ctx.validated.json.disabled,
    );

    const summary = operatorSummaries(ctx.get("admin").id).find(
      (entry) => entry.id === operator.id,
    )!;

    return ctx.json(summary);
  }),
]);
