import { HTTPException } from "hono/http-exception";

import { describeError } from "@/domain/httpError";

import { errorHandlerFactory } from "_/api:factory";

/**
 * The central error handler for the hub.
 *
 * Always JSON: every caller here is the hub's own fetch client, which throws
 * on a non-2xx and reads `{ error, code }` off the body.
 */
export default errorHandlerFactory(async (error, ctx) => {
  if (error instanceof HTTPException) return error.getResponse();

  const { status, body } = describeError(error);
  return ctx.json(body, status as never);
});
