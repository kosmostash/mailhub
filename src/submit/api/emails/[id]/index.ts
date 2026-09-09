import * as emails from "@/domain/emails";
import { type EmailViewT, emailView } from "@/domain/wire";

import { defineRoute } from "_/api";

/**
 * Poll an email - `GET /api/emails/{id}` (§3.3).
 *
 * The submitting project reads back lifecycle state, delivery status,
 * timestamps and the last error. An id belonging to a different collection
 * answers 404 exactly like one that does not exist, so collections cannot
 * observe each other.
 */
export default defineRoute<"emails/[id]", [
  // Email ids are UUIDs; anything else is rejected before the handler runs.
  VRefine<string, { format: "uuid" }>,
]>(({ GET }) => [
  GET<{
    response: [200, "json", EmailViewT];
  }>(async (ctx) => {
    const { id } = ctx.validated.params;
    const email = emails.findForCollection(ctx.get("collection").id, id);
    return ctx.json(emailView(email));
  }),
]);
