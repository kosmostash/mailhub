import { getCookie } from "hono/cookie";

import { unauthorized } from "@/domain/errors";
import * as sessions from "@/domain/sessions";

import appFactory, { routes } from "_/api:factory";

import defaultErrorHandler from "./errors";

/**
 * The hub's Hono instance.
 *
 * Authentication is registered natively here, not as a cascading `use.ts`, for
 * the same reason as in the submission API: KosmoJS composes payload
 * validation into each route chain *ahead* of folder middleware, and §5.1 is
 * unambiguous that unauthenticated access to any application data must be
 * refused - before anything parses a body.
 *
 * Authorization is the opposite case and does live in cascading `use.ts`
 * files: it is per-subtree, it needs the typed context that `UseT` cascades,
 * and by then the caller is already known.
 */

/**
 * The routes that answer without a session: signing in, and the first-run
 * bootstrap that creates the superadmin. Matched on the route's own tail, so
 * the folder's `backend.base` stays a config concern.
 */
const PUBLIC_ROUTES = ["/session", "/bootstrap"];

export default appFactory(routes, ({ app }) => {
  app.use(async function authenticate(ctx, next) {
    const actor = sessions.resolve(getCookie(ctx, sessions.COOKIE_NAME));
    if (actor) ctx.set("actor", actor);

    if (actor || PUBLIC_ROUTES.some((route) => ctx.req.path.endsWith(route))) {
      return next();
    }

    // A revoked session and a missing one are the same thing from here: the
    // browser is told to sign in again.
    throw unauthorized();
  });

  app.onError(defaultErrorHandler);
});
