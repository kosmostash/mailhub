import * as emails from "@/domain/emails";
import * as webhooks from "@/domain/webhooks";

import { defineRoute } from "_/api";

type WebhookResultT = {
  /** How many events correlated with a stored email (§3.4). */
  matched: number;
  received: number;
};

/**
 * Delivery-event webhook - `POST /api/webhooks/{provider}` (§3.4).
 *
 * The body is taken as `raw` rather than `json` on purpose: signature
 * verification has to run over the bytes the provider actually signed, and a
 * parse-then-reserialize round trip is not those bytes.
 *
 * Events naming an unknown message are counted as unmatched and otherwise
 * ignored - the webhook never errors on an id it does not recognise, because a
 * provider that gets a 4xx will keep redelivering forever (§4.3).
 */
export default defineRoute<"[provider]", [
  // The provider type the events came from - `smtp`, `sendgrid`, ...
  VRefine<string, { minLength: 1, maxLength: 40, pattern: "^[a-z0-9_-]+$" }>,
]>(({ POST }) => [
  POST<{
    raw: VRefine<string, { maxLength: 1_000_000 }>;
    response: [200, "json", WebhookResultT];
  }>(async (ctx) => {
    const { provider } = ctx.validated.params;

    const events = webhooks.accept(provider, ctx.validated.raw, ctx.req.raw.headers);
    const matched = emails.applyDeliveryEvents(events);

    return ctx.json({ matched, received: events.length });
  }),
]);
