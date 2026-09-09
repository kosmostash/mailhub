import { forbidden } from "@/domain/errors";
import type { UserT } from "@/domain/types";

import { use } from "_/api";

/**
 * Approve, send, bulk send and send-to-me are the operator's alone (§5).
 *
 * The gate sits on the whole subtree rather than in each handler: an admin
 * reading an email is fine, an admin *acting* on it in their own identity is
 * not - they impersonate first. Because it cascades, every action added below
 * inherits the rule instead of restating it, and `UseT` hands each handler the
 * acting operator already typed.
 */
export type UseT = {
  operator: UserT;
};

export default [
  use<UseT>(async function requireOperatorIdentity(ctx, next) {
    const { identity } = ctx.get("actor");

    if (identity.role !== "operator") {
      throw forbidden(
        "Approving and sending are an operator's actions - impersonate one to act",
        "wrong_role",
      );
    }

    ctx.set("operator", identity);
    return next();
  }),
];
