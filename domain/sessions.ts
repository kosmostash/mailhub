import { createHmac } from "node:crypto";

import { db } from "@/db";
import { type SessionRow, toSession } from "@/db/rows";

import * as accounts from "./accounts";
import * as activity from "./activity";
import { inHours, isPast, now } from "./clock";
import { config } from "./config";
import { conflict, forbidden, notFound, unauthorized } from "./errors";
import { newSessionToken } from "./ids";
import { verifyPassword } from "./passwords";
import type { ActorT, SessionT, UserT } from "./types";

/**
 * Sessions and impersonation.
 *
 * Sessions live in the database rather than in a self-contained token, because
 * §2.1.5 requires disabling an account to revoke its sessions *immediately* -
 * something a stateless token cannot do without a revocation list, which is a
 * session table wearing a hat.
 *
 * The cookie carries a random token; the table stores its HMAC under the
 * installation secret. A stolen database yields no usable cookies, and
 * rotating `MAILHUB_SESSION_SECRET` signs everyone out at once.
 */

const tokenId = (token: string): string =>
  createHmac("sha256", config.sessionSecret).update(token).digest("hex");

export const COOKIE_NAME = "mailhub_session";

const insert = (userId: string): string => {
  const token = newSessionToken();
  const timestamp = now();

  db()
    .prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(tokenId(token), userId, timestamp, inHours(config.sessionTtlHours), timestamp);

  return token;
};

const findByToken = (token: string): SessionT | undefined => {
  const row = db()
    .prepare<[string], SessionRow>("SELECT * FROM sessions WHERE id = ?")
    .get(tokenId(token));
  return row && toSession(row);
};

export const revoke = (sessionId: string): void => {
  db().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
};

/**
 * Drop every session belonging to an account, and every session currently
 * impersonating it - suspending an operator must also eject the admin who is
 * standing in their shoes.
 */
export const revokeForUser = (userId: string): void => {
  db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  db()
    .prepare("UPDATE sessions SET impersonated_user_id = NULL WHERE impersonated_user_id = ?")
    .run(userId);
};

export const purgeExpired = (): void => {
  db().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now());
};

/**
 * Sign in, for every role alike (§5.1). A suspended account - or one whose
 * admin is suspended - cannot sign in.
 */
export const signIn = async (email: string, password: string): Promise<string> => {
  const user = accounts.findByEmail(email);
  const stored = user && accounts.passwordHashOf(user.id);

  // Verify even when the account is unknown, so a missing address and a wrong
  // password take the same time to answer.
  const ok = await verifyPassword(password, stored ?? "scrypt$1$1$1$x$x");
  if (!user || !ok) throw unauthorized("Wrong email or password", "bad_credentials");

  if (accounts.isSuspended(user)) {
    throw forbidden("This account is disabled", "account_disabled");
  }

  const token = insert(user.id);

  activity.record({
    action: "account.sign_in",
    objectType: "user",
    objectId: user.id,
    objectLabel: user.email,
    actor: { user },
  });

  return token;
};

/** Sign in immediately after first-run bootstrap, with no password round-trip. */
export const signInDirect = (user: UserT): string => insert(user.id);

/**
 * Turn a cookie token into an actor, or `undefined` when there is nothing to
 * resolve. This is where impersonation collapses into a single `identity` the
 * rest of the domain can use without special-casing.
 */
export const resolve = (token: string | undefined): ActorT | undefined => {
  if (!token) return undefined;

  const session = findByToken(token);
  if (!session) return undefined;

  if (isPast(session.expiresAt)) {
    revoke(session.id);
    return undefined;
  }

  const account = accounts.findById(session.userId);
  if (!account || accounts.isSuspended(account)) {
    revoke(session.id);
    return undefined;
  }

  let identity = account;
  let impersonating = false;

  if (session.impersonatedUserId) {
    const assumed = accounts.findById(session.impersonatedUserId);
    if (assumed && !accounts.isSuspended(assumed)) {
      identity = assumed;
      impersonating = true;
    } else {
      // The assumed identity has gone or been suspended: fall back to the
      // impersonator's own identity rather than leaving a dangling one.
      db()
        .prepare("UPDATE sessions SET impersonated_user_id = NULL WHERE id = ?")
        .run(session.id);
      session.impersonatedUserId = null;
    }
  }

  // Cheap enough to write on every request, and it is what the operator list's
  // "last seen" reads.
  db().prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now(), session.id);

  return { session, account, identity, impersonating };
};

export const mustResolve = (token: string | undefined): ActorT => {
  const actor = resolve(token);
  if (!actor) throw unauthorized();
  return actor;
};

// ── impersonation (§2.2) ────────────────────────────────────────────────────

/**
 * Whether `account` may assume `target`'s identity.
 *
 * An admin reaches their own operators and nobody else; the superadmin reaches
 * any admin or any operator, of any admin. Nobody impersonates the superadmin,
 * and nobody impersonates themselves.
 */
export const mayImpersonate = (account: UserT, target: UserT): boolean => {
  if (account.id === target.id) return false;
  if (target.role === "superadmin") return false;
  if (account.role === "superadmin") return true;
  if (account.role === "admin") {
    return target.role === "operator" && target.adminId === account.id;
  }
  return false;
};

/** Every identity `account` may assume, for the UI's impersonation menus. */
export const impersonationTargets = (account: UserT): Array<UserT> => {
  if (account.role === "superadmin") {
    return [...accounts.listAdmins(), ...accounts.listAllOperators()].filter((target) =>
      mayImpersonate(account, target),
    );
  }
  if (account.role === "admin") return accounts.listOperators(account.id);
  return [];
};

export const start = (actor: ActorT, targetId: string): ActorT => {
  // Impersonation does not nest: end the current one first, then start the
  // next. Chaining through an assumed identity is exactly what §2.2 rules out.
  if (actor.impersonating) {
    throw conflict("End the current impersonation first", "already_impersonating");
  }

  const target = accounts.findById(targetId);
  if (!target || !mayImpersonate(actor.account, target)) throw notFound("Account");

  // Assuming a suspended identity would hand back the very capabilities the
  // suspension took away, so it is refused while the suspension stands.
  if (accounts.isSuspended(target)) {
    throw conflict("That account is disabled", "target_disabled");
  }

  db()
    .prepare("UPDATE sessions SET impersonated_user_id = ? WHERE id = ?")
    .run(target.id, actor.session.id);

  activity.record({
    action: "impersonation.start",
    objectType: "user",
    objectId: target.id,
    objectLabel: target.email,
    actor: { user: actor.account },
    scope:
      target.role === "operator"
        ? { adminId: target.adminId, operatorId: target.id }
        : { adminId: target.id },
    detail: { by: actor.account.email },
  });

  return {
    session: { ...actor.session, impersonatedUserId: target.id },
    account: actor.account,
    identity: target,
    impersonating: true,
  };
};

export const end = (actor: ActorT): ActorT => {
  if (!actor.impersonating) return actor;

  db()
    .prepare("UPDATE sessions SET impersonated_user_id = NULL WHERE id = ?")
    .run(actor.session.id);

  activity.record({
    action: "impersonation.end",
    objectType: "user",
    objectId: actor.identity.id,
    objectLabel: actor.identity.email,
    actor: { user: actor.account },
    scope:
      actor.identity.role === "operator"
        ? { adminId: actor.identity.adminId, operatorId: actor.identity.id }
        : { adminId: actor.identity.id },
    detail: { by: actor.account.email },
  });

  return {
    session: { ...actor.session, impersonatedUserId: null },
    account: actor.account,
    identity: actor.account,
    impersonating: false,
  };
};
