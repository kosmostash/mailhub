import { forbidden } from "@/domain/errors";

import { use } from "_/api";

/**
 * Admin management is the superadmin's, in its own identity (§5.8).
 *
 * The one capability that is never carried into an assumed identity: the
 * superadmin exists to answer what happens when an admin misbehaves, and an
 * admin who could be impersonated into managing admins would defeat that.
 * The capability table says as much - "Manage admins" has no "impersonating"
 * column entry.
 */
/** Nothing to add to the context: the actor is already on it. */
export type UseT = {};

export default [
  use<UseT>(async function requireSuperadmin(ctx, next) {
    const actor = ctx.get("actor");

    if (actor.identity.role !== "superadmin" || actor.impersonating) {
      throw forbidden("Only the superadmin manages admins", "wrong_role");
    }

    return next();
  }),
];
