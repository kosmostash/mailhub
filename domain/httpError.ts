import { HTTPError, ValidationError } from "@kosmojs/core/errors";

import { MailhubError } from "./errors";
import type { ErrorViewT } from "./wire";

/**
 * One failure vocabulary for all three source folders.
 *
 * Each folder keeps its own `api/errors.ts` - that file is the seam KosmoJS
 * gives you and it stays where it belongs - but the mapping itself lives here
 * so a client project, the hub UI and a delivery provider all read the same
 * `{ error, code }` body and the same status for the same failure (§6).
 */
export const describeError = (error: unknown): { status: number; body: ErrorViewT } => {
  if (error instanceof MailhubError) {
    return { status: error.statusCode, body: { error: error.message, code: error.code } };
  }

  // Thrown by the type-derived validators before a handler runs: a malformed
  // payload is a 422, not the 400 the seeded handler would give it, so it
  // lines up with the rest of the surface (§6).
  if (error instanceof ValidationError) {
    return {
      status: 422,
      body: { error: `${error.target}: ${error.errorMessage}`, code: "invalid_payload" },
    };
  }

  if (error instanceof HTTPError) {
    return { status: error.status, body: { error: error.message, code: "error" } };
  }

  if (Array.isArray(error)) {
    const [status, message] = error as [number, string];
    return { status, body: { error: message, code: "error" } };
  }

  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode: unknown }).statusCode) || 500
      : 500;

  const message = error instanceof Error ? error.message : "Unknown error";

  // Nothing about an unexpected failure is a client's business, but it is very
  // much the operator's: it goes to the log in full and to the wire as a
  // shrug.
  if (status >= 500) console.error("[mailhub] unhandled error:", error);

  return {
    status,
    body: { error: status >= 500 ? "Internal error" : message, code: "error" },
  };
};
