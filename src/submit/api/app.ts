import * as collections from "@/domain/collections";

import appFactory, { routes } from "_/api:factory";

import defaultErrorHandler from "./errors";

/**
 * The submission API's Hono instance.
 *
 * The collection check is registered natively here rather than as a cascading
 * `use.ts`, and that placement is the point: KosmoJS composes payload
 * validation into each route's chain *ahead* of folder middleware, so a
 * `use.ts` would let an unknown caller learn about our payload schema before
 * being told it is unknown. §3.1 wants the opposite - an unknown or missing id
 * is a 401, full stop - which means authenticating before anything parses a
 * body.
 *
 * `/health` is the one route that must answer without a credential (§3.5).
 */
export default appFactory(routes, ({ app }) => {
  app.use(async function authorizeCollection(ctx, next) {
    if (ctx.req.path.endsWith("/health")) return next();

    const { collection } = collections.authorizeSubmission(
      ctx.req.header("x-collection-id"),
    );
    ctx.set("collection", collection);

    return next();
  });

  app.onError(defaultErrorHandler);
});
