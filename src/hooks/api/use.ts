import { use } from "_/api";

/**
 * Global middleware for the webhook endpoint.
 *
 * This folder is the one part of MailHub that is public by nature: delivery
 * providers have to reach it from the internet. It carries no collection id
 * and no session - a request proves itself with the provider's own signature,
 * checked per provider in the route (§3.4).
 */
export default [
  use(async function requestId(ctx, next) {
    ctx.header("x-request-id", crypto.randomUUID());
    return next();
  }),
];
