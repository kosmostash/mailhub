import { use } from "_/api";

/**
 * Global middleware for the submission API.
 *
 * Deliberately thin: this folder is the LAN/DMZ-facing door, and the only
 * credential it knows is the collection id - checked in `emails/use.ts`, which
 * wraps exactly the routes that accept or expose email, and not `/health`.
 */
export default [
  use(async function requestId(ctx, next) {
    ctx.header("x-request-id", crypto.randomUUID());
    return next();
  }),
];
