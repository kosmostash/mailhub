import * as confirmations from "@/domain/confirmations";
import * as sessions from "@/domain/sessions";
import * as testAddresses from "@/domain/testAddresses";

import { defineRoute } from "_/api";

import { type TestAddressViewT, testAddressView } from "~/types/views";

type AccountViewT = {
  id: string;
  email: string;
  role: "superadmin" | "admin" | "operator";
  /** An outstanding credential change waiting on its code (§2.1.7). */
  pendingChange: {
    purpose: "email" | "password";
    sentTo: string;
    expiresAt: string;
    via: string;
  } | null;
  /** Operators only - admins and the superadmin have none of their own (§2.5). */
  testAddresses: Array<TestAddressViewT>;
  /** Who this account may assume, for the impersonation control (§2.2). */
  impersonationTargets: Array<{ id: string; email: string; role: string }>;
};

/**
 * The account page (§5.10).
 *
 * It answers for the *signed-in account*, not the assumed identity: credential
 * changes are self-service by definition, so an impersonator sees their own
 * account here rather than the one they are standing in.
 *
 * Test addresses are the exception - they belong to whoever is acting, since
 * "send to me" uses the impersonated operator's list.
 */
export default defineRoute<"account">(({ GET }) => [
  GET<{
    response: [200, "json", AccountViewT];
  }>(async (ctx) => {
    const actor = ctx.get("actor");
    const pending = confirmations.pending(actor.account);

    return ctx.json({
      id: actor.account.id,
      email: actor.account.email,
      role: actor.account.role,
      pendingChange: pending
        ? {
            purpose: pending.purpose,
            sentTo: pending.sentTo,
            expiresAt: pending.expiresAt,
            via: pending.via,
          }
        : null,
      testAddresses:
        actor.identity.role === "operator"
          ? testAddresses.listFor(actor.identity.id).map(testAddressView)
          : [],
      impersonationTargets: actor.impersonating
        ? []
        : sessions
            .impersonationTargets(actor.account)
            .map(({ id, email, role }) => ({ id, email, role })),
    });
  }),
]);
