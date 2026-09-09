import { forbidden } from "@/domain/errors";
import type { UserT } from "@/domain/types";

import { use } from "_/api";

/**
 * Providers are the admin's own write domain (§2.4, §5.6).
 *
 * Delivery credentials are infrastructure, so they stay in the admin's hands:
 * an operator never reaches this subtree at all, and the superadmin - who has
 * no CRUD of its own, one level up - impersonates an admin to manage them.
 *
 * Every method here is admin-only, reads included, which is exactly the case a
 * cascading gate is for.
 */
export type UseT = {
  admin: UserT;
};

export default [
  use<UseT>(async function requireAdminIdentity(ctx, next) {
    const { identity } = ctx.get("actor");

    if (identity.role !== "admin") {
      throw forbidden(
        "Providers are managed by admins - impersonate one to act",
        "wrong_role",
      );
    }

    ctx.set("admin", identity);
    return next();
  }),
];
