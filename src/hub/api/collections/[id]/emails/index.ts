import * as collections from "@/domain/collections";
import * as emails from "@/domain/emails";

import { defineRoute } from "_/api";

import { type EmailSummaryT, emailSummary } from "~/types/views";

type EmailPageViewT = {
  emails: Array<EmailSummaryT>;
  total: number;
  limit: number;
  offset: number;
};

/**
 * One collection's emails (§5.4).
 *
 * Filterable by lifecycle state and delivery status, paginated, and always
 * ordered with the emails awaiting review first - that ordering is part of the
 * contract, not a preference, so review work cannot be scrolled past.
 *
 * Read-only for everyone: acting on these emails happens under
 * `emails/actions`, which is gated to an operator identity.
 */
export default defineRoute<"collections/[id]/emails", [
  VRefine<string, { minLength: 4, maxLength: 64 }>,
]>(({ GET }) => [
  GET<{
    query: {
      state?: "pending" | "ready" | "sent";
      deliveryStatus?: "unknown" | "sent" | "delivered" | "bounced";
      limit?: VRefine<number, { minimum: 1, maximum: 200, multipleOf: 1 }>;
      offset?: VRefine<number, { minimum: 0, multipleOf: 1 }>;
    };
    response: [200, "json", EmailPageViewT];
  }>(async (ctx) => {
    // Establishes scope first: an out-of-scope collection 404s before any
    // email is read.
    const collection = collections.mustSee(ctx.get("actor"), ctx.validated.params.id);

    const { state, deliveryStatus } = ctx.validated.query;
    const limit = ctx.validated.query.limit ?? 50;
    const offset = ctx.validated.query.offset ?? 0;

    const page = emails.list(collection.id, { state, deliveryStatus, limit, offset });

    return ctx.json({
      emails: page.emails.map(emailSummary),
      total: page.total,
      limit,
      offset,
    });
  }),
]);
