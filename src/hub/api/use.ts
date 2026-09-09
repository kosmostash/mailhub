import { use } from "_/api";

/**
 * Global middleware for the hub.
 *
 * Authentication is not here: it has to run before payload validation, which
 * KosmoJS composes ahead of folder middleware, so it lives in `api/app.ts`.
 * What is left is genuinely app-wide and order-insensitive.
 */
export default [
  use(async function noStore(ctx, next) {
    // Everything the hub answers is per-session and live: counters, review
    // queues, the trail. None of it should sit in a cache.
    ctx.header("cache-control", "no-store");
    return next();
  }),
];
