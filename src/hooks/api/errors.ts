import { HTTPException } from "hono/http-exception";

import { describeError } from "@/domain/httpError";

import { errorHandlerFactory } from "_/api:factory";

/**
 * The central error handler for the public webhook endpoint.
 *
 * Always JSON: the callers here are delivery providers, not people.
 */
export default errorHandlerFactory(async (error, ctx) => {
  if (error instanceof HTTPException) return error.getResponse();

  const { status, body } = describeError(error);
  return ctx.json(body, status as never);
});
