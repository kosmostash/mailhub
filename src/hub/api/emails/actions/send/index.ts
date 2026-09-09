import * as sender from "@/domain/sender";

import { defineRoute } from "_/api";

import type { OutcomeViewT } from "~/types/views";

/**
 * Explicit send, single or bulk (§4.2, §5.4).
 *
 * One endpoint serves both: sending one email is a batch of one, so the
 * outcome report has exactly one shape. The attempt cap is ignored here - a
 * human pressing Send *is* the intervention the back-off waits for - and a
 * non-sendable id never aborts the rest.
 */
export default defineRoute<"emails/actions/send">(({ POST }) => [
  POST<{
    json: {
      ids: VRefine<Array<VRefine<string, { format: "uuid" }>>, { minItems: 1, maxItems: 200 }>;
    };
    response: [200, "json", { outcomes: Array<OutcomeViewT> }];
  }>(async (ctx) => {
    const outcomes = await sender.sendExplicit(ctx.get("actor"), ctx.validated.json.ids);
    return ctx.json({ outcomes });
  }),
]);
