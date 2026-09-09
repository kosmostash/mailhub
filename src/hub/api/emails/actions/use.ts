import { forbidden } from "@/domain/errors";

import { use } from "_/api";

/**
 * Approve, send, bulk send and send-to-me are the operator's alone (§5).
 *
 * The gate sits on the whole subtree rather than in each handler: an admin
 * reading an email is fine, an admin *acting* on it in their own identity is
 * not - they impersonate first. Because it cascades, every action added below
 * inherits the rule instead of restating it.
 *
 * It adds nothing to the context: the handlers pass the whole actor down to the
 * domain, which needs the impersonator too in order to mark the trail (§2.2).
 */
export type UseT = {};

export default [
  use<UseT>(async function requireOperatorIdentity(ctx, next) {
    if (ctx.get("actor").identity.role !== "operator") {
      throw forbidden(
        "Approving and sending are an operator's actions - impersonate one to act",
        "wrong_role",
      );
    }

    return next();
  }),
];
