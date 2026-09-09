import { db, transaction } from "@/db";
import { type UserRow, toUser } from "@/db/rows";

import * as activity from "./activity";
import { now } from "./clock";
import { conflict, forbidden, invalid, notFound } from "./errors";
import { newId } from "./ids";
import { assertPasswordAcceptable, hashPassword } from "./passwords";
import * as sessions from "./sessions";
import type { ActorT, RoleT, UserT } from "./types";

/**
 * Accounts and the three-level hierarchy (§2.1).
 *
 * The shape of every write here is the same: check the actor may do it, check
 * the state allows it, do it and record it. Authority is decided against the
 * actor's *effective identity*, so an admin impersonating an operator is an
 * operator here and nothing in this module has to know about impersonation.
 */

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const assertEmailAcceptable = (email: string): void => {
  if (!EMAIL_PATTERN.test(email)) {
    throw invalid("Not a valid email address", "invalid_email");
  }
};

// ── queries ─────────────────────────────────────────────────────────────────

export const findById = (id: string): UserT | undefined => {
  const row = db()
    .prepare<[string], UserRow>("SELECT * FROM users WHERE id = ?")
    .get(id);
  return row && toUser(row);
};

export const findByEmail = (email: string): UserT | undefined => {
  const row = db()
    .prepare<[string], UserRow>("SELECT * FROM users WHERE email = ?")
    .get(normalizeEmail(email));
  return row && toUser(row);
};

export const passwordHashOf = (id: string): string | undefined =>
  db()
    .prepare<[string], { password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = ?",
    )
    .get(id)?.password_hash;

export const mustFind = (id: string): UserT => {
  const user = findById(id);
  if (!user) throw notFound("Account");
  return user;
};

export const superadmin = (): UserT | undefined => {
  const row = db()
    .prepare<[], UserRow>("SELECT * FROM users WHERE role = 'superadmin'")
    .get();
  return row && toUser(row);
};

export const superadminExists = (): boolean => superadmin() !== undefined;

export const listAdmins = (): Array<UserT> =>
  db()
    .prepare<[], UserRow>("SELECT * FROM users WHERE role = 'admin' ORDER BY email")
    .all()
    .map(toUser);

export const listOperators = (adminId: string): Array<UserT> =>
  db()
    .prepare<[string], UserRow>(
      "SELECT * FROM users WHERE role = 'operator' AND admin_id = ? ORDER BY email",
    )
    .all(adminId)
    .map(toUser);

export const listAllOperators = (): Array<UserT> =>
  db()
    .prepare<[], UserRow>("SELECT * FROM users WHERE role = 'operator' ORDER BY email")
    .all()
    .map(toUser);

/**
 * Whether an account is barred right now.
 *
 * An operator is barred by its own suspension *or* by its admin's - disabling
 * an admin covers the whole subtree (§2.1.5). The two are stored separately on
 * purpose, so re-enabling an admin does not silently un-suspend an operator
 * that was disabled in its own right.
 */
export const isSuspended = (user: UserT): boolean => {
  if (user.disabledAt) return true;
  if (user.role !== "operator" || !user.adminId) return false;
  return findById(user.adminId)?.disabledAt != null;
};

/** The admin whose subtree this account sits in, for scoping and provider access. */
export const adminIdOf = (user: UserT): string | null =>
  user.role === "operator" ? user.adminId : user.role === "admin" ? user.id : null;

// ── scope helpers ───────────────────────────────────────────────────────────

/**
 * The operator, as seen by `actor`, or `undefined` when it is out of scope.
 * Out-of-scope reads behave exactly like missing ones (§6), so callers turn
 * `undefined` into a 404 and never a 403.
 */
export const visibleOperator = (actor: ActorT, operatorId: string): UserT | undefined => {
  const operator = findById(operatorId);
  if (!operator || operator.role !== "operator") return undefined;

  const { identity } = actor;
  if (identity.role === "superadmin") return operator;
  if (identity.role === "admin") return operator.adminId === identity.id ? operator : undefined;
  return operator.id === identity.id ? operator : undefined;
};

/** Every operator whose objects `actor` may read. */
export const visibleOperators = (actor: ActorT): Array<UserT> => {
  const { identity } = actor;
  switch (identity.role) {
    case "superadmin":
      return listAllOperators();
    case "admin":
      return listOperators(identity.id);
    case "operator":
      return [identity];
  }
};

const assertRole = (actor: ActorT, role: RoleT, what: string): void => {
  if (actor.identity.role !== role) {
    throw forbidden(
      `${what} requires ${role === "superadmin" ? "the superadmin" : `a ${role}`} identity`,
      "wrong_role",
    );
  }
};

// ── creation ────────────────────────────────────────────────────────────────

type CredentialsT = { email: string; password: string };

const insert = async (input: {
  role: RoleT;
  email: string;
  password: string;
  adminId: string | null;
}): Promise<UserT> => {
  const email = normalizeEmail(input.email);
  assertEmailAcceptable(email);
  assertPasswordAcceptable(input.password);

  if (findByEmail(email)) {
    throw conflict("That email address is already taken", "email_taken");
  }

  // Hashing is slow by design, so it happens before the transaction rather
  // than inside it.
  const passwordHash = await hashPassword(input.password);
  const timestamp = now();
  const user: UserT = {
    id: newId(),
    role: input.role,
    email,
    adminId: input.adminId,
    disabledAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    db()
      .prepare(
        `INSERT INTO users (id, role, email, password_hash, admin_id, created_at, updated_at)
         VALUES (@id, @role, @email, @passwordHash, @adminId, @createdAt, @updatedAt)`,
      )
      .run({ ...user, passwordHash });
  } catch (error) {
    // The unique indexes are the real authority: two concurrent bootstraps or
    // two admins claiming one address both land here rather than racing past
    // the checks above.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("users_one_superadmin")) {
      throw conflict("A superadmin already exists", "superadmin_exists");
    }
    if (message.includes("users_email_key")) {
      throw conflict("That email address is already taken", "email_taken");
    }
    throw error;
  }

  return user;
};

/**
 * First-run bootstrap (§2.1.4). Offered only while no superadmin exists; the
 * partial unique index guarantees a second one can never be created, whatever
 * races this call.
 */
export const createSuperadmin = async (input: CredentialsT): Promise<UserT> => {
  if (superadminExists()) {
    throw conflict("A superadmin already exists", "superadmin_exists");
  }

  const user = await insert({
    role: "superadmin",
    email: input.email,
    password: input.password,
    adminId: null,
  });

  // No session exists yet, so the new superadmin is recorded as its own actor.
  activity.record({
    action: "superadmin.bootstrap",
    objectType: "user",
    objectId: user.id,
    objectLabel: user.email,
    actor: { user },
    scope: {},
  });

  return user;
};

/** The superadmin creates admins (§2.1.1). */
export const createAdmin = async (actor: ActorT, input: CredentialsT): Promise<UserT> => {
  assertRole(actor, "superadmin", "Creating an admin");

  const admin = await insert({
    role: "admin",
    email: input.email,
    password: input.password,
    adminId: null,
  });

  activity.record({
    action: "admin.create",
    objectType: "user",
    objectId: admin.id,
    objectLabel: admin.email,
    actor,
    scope: {},
  });

  return admin;
};

/** An admin creates operators (§2.1.2). */
export const createOperator = async (actor: ActorT, input: CredentialsT): Promise<UserT> => {
  assertRole(actor, "admin", "Creating an operator");

  const operator = await insert({
    role: "operator",
    email: input.email,
    password: input.password,
    adminId: actor.identity.id,
  });

  activity.record({
    action: "operator.create",
    objectType: "user",
    objectId: operator.id,
    objectLabel: operator.email,
    actor,
    scope: { adminId: actor.identity.id, operatorId: operator.id },
  });

  return operator;
};

// ── administrative actions ──────────────────────────────────────────────────

/**
 * The account `actor` may administer, or `undefined` if there is no such
 * account in reach: the superadmin administers admins, an admin administers
 * its own operators. Always one level down, never sideways (§2.1.5).
 */
const administrable = (actor: ActorT, targetId: string): UserT | undefined => {
  const target = findById(targetId);
  if (!target) return undefined;

  if (actor.identity.role === "superadmin") {
    return target.role === "admin" ? target : undefined;
  }
  if (actor.identity.role === "admin") {
    return target.role === "operator" && target.adminId === actor.identity.id
      ? target
      : undefined;
  }
  return undefined;
};

const requireAdministrable = (actor: ActorT, targetId: string): UserT => {
  const target = administrable(actor, targetId);
  if (!target) throw notFound("Account");
  return target;
};

/**
 * An administrative reset - the recovery path when an account cannot complete
 * the confirmation gate, and deliberately distinct from a self-service change
 * (§2.1.7).
 */
export const resetPassword = async (
  actor: ActorT,
  targetId: string,
  password: string,
): Promise<void> => {
  const target = requireAdministrable(actor, targetId);
  assertPasswordAcceptable(password);

  const passwordHash = await hashPassword(password);
  db()
    .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(passwordHash, now(), target.id);

  // A reset is a credential change: whoever was signed in with the old one
  // should not stay signed in.
  sessions.revokeForUser(target.id);

  activity.record({
    action: target.role === "admin" ? "admin.reset_password" : "operator.reset_password",
    objectType: "user",
    objectId: target.id,
    objectLabel: target.email,
    actor,
    scope:
      target.role === "admin"
        ? {}
        : { adminId: target.adminId, operatorId: target.id },
  });
};

/**
 * Disable or re-enable an account (§2.1.5).
 *
 * Disabling revokes every session in the account's scope at once - for an
 * admin that is the admin and all their operators - and the same scope stops
 * accepting submissions and stops being drained by the sender. Nothing is
 * deleted or moved; that is reassignment's job (§2.1.6).
 */
export const setDisabled = (actor: ActorT, targetId: string, disabled: boolean): UserT => {
  const target = requireAdministrable(actor, targetId);

  if (Boolean(target.disabledAt) === disabled) return target;

  const timestamp = now();
  db()
    .prepare("UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?")
    .run(disabled ? timestamp : null, timestamp, target.id);

  if (disabled) {
    sessions.revokeForUser(target.id);
    if (target.role === "admin") {
      for (const operator of listOperators(target.id)) sessions.revokeForUser(operator.id);
    }
  }

  const action = `${target.role}.${disabled ? "disable" : "enable"}`;
  activity.record({
    action,
    objectType: "user",
    objectId: target.id,
    objectLabel: target.email,
    actor,
    scope:
      target.role === "admin" ? {} : { adminId: target.adminId, operatorId: target.id },
  });

  return { ...target, disabledAt: disabled ? timestamp : null };
};

/** What an account still holds - the gate deletion has to pass (§2.1.6). */
export const holdings = (user: UserT): { operators: number; providers: number; collections: number } => {
  const count = (sql: string, id: string): number =>
    db().prepare<[string], { n: number }>(sql).get(id)!.n;

  return user.role === "admin"
    ? {
        operators: count(
          "SELECT COUNT(*) AS n FROM users WHERE role = 'operator' AND admin_id = ?",
          user.id,
        ),
        providers: count("SELECT COUNT(*) AS n FROM providers WHERE admin_id = ?", user.id),
        collections: 0,
      }
    : {
        operators: 0,
        providers: 0,
        collections: count(
          "SELECT COUNT(*) AS n FROM collections WHERE operator_id = ?",
          user.id,
        ),
      };
};

/**
 * Reassignment (§2.1.6) - the relief valve that makes deletion possible.
 *
 * Always one level down, always out of a suspension and into an active account.
 * An admin's operators and providers move *together*, so a collection keeps
 * pointing at the provider it was already sending through and that provider
 * lands under the same new admin - the "a collection's provider belongs to its
 * admin" invariant survives the move.
 *
 * Collection ids never change, so client projects keep submitting with no
 * config change: reassignment is invisible from outside.
 */
export const reassign = (actor: ActorT, fromId: string, toId: string): void => {
  const from = requireAdministrable(actor, fromId);
  const to = administrable(actor, toId);

  if (!to) throw notFound("Target account");
  if (from.id === to.id) throw conflict("Source and target are the same account", "same_account");
  if (!from.disabledAt) {
    throw conflict(
      "Reassignment is the way out of a suspension: disable the account first",
      "source_not_disabled",
    );
  }
  if (to.disabledAt) {
    throw conflict("The target account is disabled", "target_disabled");
  }

  const moved = transaction(() => {
    if (from.role === "admin") {
      // Names are unique per admin, so a collision at the destination has to be
      // resolved on arrival. Two providers are never silently merged into one.
      const clashes = db()
        .prepare<[string, string], { id: string; name: string }>(
          `SELECT p.id, p.name FROM providers p
            WHERE p.admin_id = ?
              AND EXISTS (SELECT 1 FROM providers q WHERE q.admin_id = ? AND q.name = p.name)`,
        )
        .all(from.id, to.id);

      for (const clash of clashes) {
        db()
          .prepare("UPDATE providers SET name = ? WHERE id = ?")
          .run(`${clash.name} (from ${from.email})`, clash.id);
      }

      const providers = db()
        .prepare("UPDATE providers SET admin_id = ?, updated_at = ? WHERE admin_id = ?")
        .run(to.id, now(), from.id).changes;

      const operators = db()
        .prepare("UPDATE users SET admin_id = ?, updated_at = ? WHERE admin_id = ?")
        .run(to.id, now(), from.id).changes;

      return { operators, providers, collections: 0 };
    }

    const clashes = db()
      .prepare<[string, string], { id: string; name: string }>(
        `SELECT c.id, c.name FROM collections c
          WHERE c.operator_id = ?
            AND EXISTS (SELECT 1 FROM collections d WHERE d.operator_id = ? AND d.name = c.name)`,
      )
      .all(from.id, to.id);

    for (const clash of clashes) {
      db()
        .prepare("UPDATE collections SET name = ? WHERE id = ?")
        .run(`${clash.name} (from ${from.email})`, clash.id);
    }

    const collections = db()
      .prepare("UPDATE collections SET operator_id = ?, updated_at = ? WHERE operator_id = ?")
      .run(to.id, now(), from.id).changes;

    return { operators: 0, providers: 0, collections };
  });

  activity.record({
    action: from.role === "admin" ? "admin.reassign" : "operator.reassign",
    objectType: "user",
    objectId: from.id,
    objectLabel: from.email,
    actor,
    scope: from.role === "admin" ? {} : { adminId: from.adminId, operatorId: from.id },
    detail: { to: to.email, toId: to.id, ...moved },
  });
};

/**
 * Deletion (§2.1.6): only a disabled account that holds nothing. Anything else
 * is a conflict telling the caller to reassign first.
 *
 * The account's personal data goes with it - an operator's test addresses -
 * but the activity trail does not: it keeps its record of what that account
 * did, naming it as it was.
 */
export const remove = (actor: ActorT, targetId: string): void => {
  const target = requireAdministrable(actor, targetId);

  if (!target.disabledAt) {
    throw conflict("Disable the account before deleting it", "not_disabled");
  }

  const held = holdings(target);
  if (held.operators || held.providers || held.collections) {
    throw conflict(
      "This account still holds objects - reassign them first",
      "account_not_empty",
      held as unknown as Record<string, unknown>,
    );
  }

  transaction(() => {
    db().prepare("DELETE FROM test_addresses WHERE operator_id = ?").run(target.id);
    db().prepare("DELETE FROM sessions WHERE user_id = ? OR impersonated_user_id = ?").run(
      target.id,
      target.id,
    );
    db().prepare("DELETE FROM confirmation_codes WHERE user_id = ?").run(target.id);
    db().prepare("DELETE FROM users WHERE id = ?").run(target.id);
  });

  activity.record({
    action: target.role === "admin" ? "admin.delete" : "operator.delete",
    objectType: "user",
    objectId: target.id,
    objectLabel: target.email,
    actor,
    scope: target.role === "admin" ? {} : { adminId: target.adminId, operatorId: target.id },
  });
};
