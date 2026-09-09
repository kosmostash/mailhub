import * as accounts from "@/domain/accounts";

import { defineRoute } from "_/api";

import { adminSummaries } from "~/server/accountSummaries";
import type { AdminSummaryT } from "~/types/views";

/**
 * Disable or re-enable an admin (§2.1.5).
 *
 * The same workflow as disabling an operator, one level up - only the blast
 * radius differs. Disabling an admin revokes the admin's sessions *and* all
 * their operators', stops the whole subtree's mail, and refuses submissions to
 * every collection under it. Delivery webhooks for already-sent mail keep
 * updating, so history stays truthful.
 */
export default defineRoute<"admins/[id]/status", [
  VRefine<string, { format: "uuid" }>,
]>(({ PUT }) => [
  PUT<{
    json: { disabled: boolean };
    response: [200, "json", AdminSummaryT];
  }>(async (ctx) => {
    const admin = accounts.setDisabled(
      ctx.get("actor"),
      ctx.validated.params.id,
      ctx.validated.json.disabled,
    );

    return ctx.json(adminSummaries().find((entry) => entry.id === admin.id)!);
  }),
]);
