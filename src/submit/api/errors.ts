import { accepts } from "hono/accepts";
import { HTTPException } from "hono/http-exception";

import { describeError } from "@/domain/httpError";

import { errorHandlerFactory } from "_/api:factory";

/**
 * The central error handler for the submission API.
 *
 * Handlers never build error responses themselves - they throw, and this is
 * the one place that decides what a client project sees.
 */
export default errorHandlerFactory(async (error, ctx) => {
  if (error instanceof HTTPException) return error.getResponse();

  const { status, body } = describeError(error);

  // Client projects speak JSON; anything else gets the message as text so a
  // curl in a terminal is still readable.
  const type = accepts(ctx, {
    header: "Accept",
    supports: ["application/json", "text/plain"],
    default: "application/json",
  });

  return type === "application/json"
    ? ctx.json(body, status as never)
    : ctx.text(body.error, status as never);
});
