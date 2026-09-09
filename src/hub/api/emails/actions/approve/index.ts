import * as sender from "@/domain/sender";

import { defineRoute } from "_/api";

import type { OutcomeViewT } from "~/types/views";

/**
 * Approve emails - `pending -> ready` (§2.7, §5.5).
 *
 * Takes a list so the review queue can be cleared in one action, and reports
 * one outcome per id: an id that is not awaiting review says so and the rest
 * of the batch proceeds.
 */
export default defineRoute<"emails/actions/approve">(({ POST }) => [
  POST<{
    json: {
      ids: VRefine<Array<VRefine<string, { format: "uuid" }>>, { minItems: 1, maxItems: 500 }>;
    };
    response: [200, "json", { outcomes: Array<OutcomeViewT> }];
  }>(async (ctx) => {
    const outcomes = sender.approveMany(ctx.get("actor"), ctx.validated.json.ids);
    return ctx.json({ outcomes });
  }),
]);
