import * as confirmations from "@/domain/confirmations";

import { defineRoute } from "_/api";

/**
 * Change your own password (§2.1.7).
 *
 * The code goes to the address **currently** on the account, proving the
 * request comes from whoever holds it. The current password is required as
 * well, so a borrowed session alone is not enough to start the change.
 *
 * Confirming ends every *other* session for the account - the tab that made
 * the change stays signed in.
 */
export default defineRoute<"account/password">(({ POST, PUT }) => [
  POST<{
    json: {
      currentPassword: VRefine<string, { minLength: 1, maxLength: 512 }>;
      newPassword: VRefine<string, { minLength: 10, maxLength: 512 }>;
    };
    response: [200, "json", { sentTo: string; expiresAt: string; via: string }];
  }>(async (ctx) => {
    const pending = await confirmations.requestPasswordChange(
      ctx.get("actor"),
      ctx.validated.json,
    );

    return ctx.json({
      sentTo: pending.sentTo,
      expiresAt: pending.expiresAt,
      via: pending.via,
    });
  }),

  PUT<{
    json: { code: VRefine<string, { minLength: 1, maxLength: 64 }> };
    response: [200, "json", { ok: true }];
  }>(async (ctx) => {
    await confirmations.confirm(ctx.get("actor"), "password", ctx.validated.json.code);
    return ctx.json({ ok: true } as const);
  }),
]);
