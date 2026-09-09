import * as confirmations from "@/domain/confirmations";

import { defineRoute } from "_/api";

/**
 * Change your own email (§2.1.7).
 *
 * Two steps, and the split is the point: `POST` asks, sending a code to the
 * **new** address - which is what proves the account holder controls the
 * address they are moving to - and `PUT` confirms. Until the code comes back,
 * the account keeps the address it had.
 */
export default defineRoute<"account/email">(({ POST, PUT }) => [
  POST<{
    json: { email: VRefine<string, { format: "email", maxLength: 320 }> };
    response: [200, "json", { sentTo: string; expiresAt: string; via: string }];
  }>(async (ctx) => {
    const pending = await confirmations.requestEmailChange(
      ctx.get("actor"),
      ctx.validated.json.email,
    );

    return ctx.json({
      sentTo: pending.sentTo,
      expiresAt: pending.expiresAt,
      via: pending.via,
    });
  }),

  PUT<{
    json: { code: VRefine<string, { minLength: 1, maxLength: 64 }> };
    response: [200, "json", { email: string }];
  }>(async (ctx) => {
    const updated = await confirmations.confirm(
      ctx.get("actor"),
      "email",
      ctx.validated.json.code,
    );

    return ctx.json({ email: updated.email });
  }),
]);
