import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

import { config } from "@/domain/config";
import { COOKIE_NAME } from "@/domain/sessions";

/**
 * The session cookie.
 *
 * `httpOnly` keeps the token away from page scripts - which matters here more
 * than usual, since the hub renders stored HTML bodies it did not write.
 * `sameSite: lax` is enough: every write goes through the fetch client as a
 * same-origin request, and a cross-site form post cannot set the JSON content
 * type these endpoints require.
 */
export const setSessionCookie = (ctx: Context, token: string): void => {
  setCookie(ctx, COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: config.secureCookies,
    maxAge: config.sessionTtlHours * 3600,
  });
};

export const clearSessionCookie = (ctx: Context): void => {
  deleteCookie(ctx, COOKIE_NAME, { path: "/" });
};
