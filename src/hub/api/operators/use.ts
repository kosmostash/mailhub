import { forbidden } from "@/domain/errors";
import type { UserT } from "@/domain/types";

import { use } from "_/api";

/**
 * Operator management is the admin's (§5.7).
 *
 * Every method below is admin-only - listing included - so the gate belongs on
 * the subtree rather than in six handlers. The superadmin, which has no CRUD
 * of its own one level up, impersonates an admin to manage their operators.
 */
export type UseT = {
  admin: UserT;
};

export default [
  use<UseT>(async function requireAdminIdentity(ctx, next) {
    const { identity } = ctx.get("actor");

    if (identity.role !== "admin") {
      throw forbidden(
        "Operators are managed by admins - impersonate one to act",
        "wrong_role",
      );
    }

    ctx.set("admin", identity);
    return next();
  }),
];
