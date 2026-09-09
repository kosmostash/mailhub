/**
 * The one error the domain throws.
 *
 * Handlers never build error responses themselves - they throw, and each
 * folder's `api/errors.ts` turns it into JSON. `statusCode` is named for the
 * property KosmoJS's seeded error handler already reads, so an unhandled
 * MailhubError still answers with the right status rather than a 500.
 */
export class MailhubError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly detail: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MailhubError";
    this.statusCode = statusCode;
    this.code = code;
    this.detail = detail;
  }
}

/** 401 - no credentials, or credentials that name nothing. */
export const unauthorized = (message = "Authentication required", code = "unauthenticated") =>
  new MailhubError(401, code, message);

/** 403 - authenticated, but not allowed to do this. */
export const forbidden = (message = "Not allowed", code = "forbidden") =>
  new MailhubError(403, code, message);

/**
 * 404 - missing, or out of the actor's scope. The two are deliberately
 * indistinguishable, so scoping leaks nothing (§6).
 */
export const notFound = (what = "Resource", code = "not_found") =>
  new MailhubError(404, code, `${what} not found`);

/** 409 - the request is well-formed but the state refuses it. */
export const conflict = (message: string, code = "conflict", detail?: Record<string, unknown>) =>
  new MailhubError(409, code, message, detail);

/** 422 - the payload is invalid in a way the type-derived validators can't see. */
export const invalid = (message: string, code = "invalid", detail?: Record<string, unknown>) =>
  new MailhubError(422, code, message, detail);

/** 429 - too many of the same request, too quickly. */
export const tooManyRequests = (message: string, code = "rate_limited") =>
  new MailhubError(429, code, message);

/** 502 - an upstream delivery provider failed. */
export const upstreamFailure = (message: string, code = "provider_error") =>
  new MailhubError(502, code, message);
