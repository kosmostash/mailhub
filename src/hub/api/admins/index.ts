import * as accounts from "@/domain/accounts";

import { defineRoute } from "_/api";

import { adminSummaries } from "~/server/accountSummaries";
import type { AdminSummaryT } from "~/types/views";

/**
 * The admins page (§5.8) - the superadmin's landing view.
 *
 * Creating admins is the superadmin's main purpose: one per project or
 * department at org scale, or a single one for a personal installation.
 */
export default defineRoute<"admins">(({ GET, POST }) => [
  GET<{
    response: [200, "json", { admins: Array<AdminSummaryT> }];
  }>(async (ctx) => {
    return ctx.json({ admins: adminSummaries() });
  }),

  POST<{
    json: {
      email: VRefine<string, { format: "email", maxLength: 320 }>;
      password: VRefine<string, { minLength: 10, maxLength: 512 }>;
    };
    response: [201, "json", AdminSummaryT];
  }>(async (ctx) => {
    const { email, password } = ctx.validated.json;
    const admin = await accounts.createAdmin(ctx.get("actor"), { email, password });

    return ctx.json(adminSummaries().find((entry) => entry.id === admin.id)!, 201);
  }),
]);
