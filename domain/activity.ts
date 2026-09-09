import { db } from "@/db";
import { type ActivityRow, toActivityEntry } from "@/db/rows";

import { now } from "./clock";
import type { ActivityEntryT, ActorT, UserT } from "./types";

/**
 * The activity trail (§2.6).
 *
 * Two properties shape the design. First, every entry names the identity that
 * acted *and*, separately, the admin or superadmin who acted through it - an
 * audited convenience, not a disguise. Second, the trail is history rather than
 * property: the scope columns are written once, at the time of the action, and
 * are never rewritten when objects are later reassigned (§2.1.6).
 */

/**
 * Who performed the action: a signed-in actor, a bare account (first-run
 * bootstrap, where there is no session yet), or one of the two system actors.
 */
export type ActivityActorT = ActorT | { user: UserT } | "sender" | "smtp";

/** Which trails an entry shows up in. Both null means "superadmin only". */
export type ActivityScopeT = {
  adminId?: string | null;
  operatorId?: string | null;
};

export type ActivityInputT = {
  action: string;
  objectType: string;
  objectId?: string | null;
  objectLabel?: string | null;
  actor: ActivityActorT;
  scope?: ActivityScopeT;
  detail?: Record<string, unknown> | null;
};

/** The trail scope a user's own actions belong in. */
export const scopeOf = (user: UserT): ActivityScopeT => {
  switch (user.role) {
    case "operator":
      return { adminId: user.adminId, operatorId: user.id };
    case "admin":
      return { adminId: user.id, operatorId: null };
    case "superadmin":
      return { adminId: null, operatorId: null };
  }
};

export const record = (input: ActivityInputT): void => {
  const kind =
    typeof input.actor === "string"
      ? input.actor
      : ("identity" in input.actor ? "session" : "account");

  const actor = kind === "session" ? (input.actor as ActorT) : undefined;
  const identity =
    actor?.identity ?? (kind === "account" ? (input.actor as { user: UserT }).user : undefined);

  const scope = input.scope ?? (identity ? scopeOf(identity) : {});

  db()
    .prepare(
      `INSERT INTO activity (
         action, object_type, object_id, object_label,
         actor_kind, actor_id, actor_email, actor_role,
         impersonator_id, impersonator_email, impersonator_role,
         scope_admin_id, scope_operator_id, detail, created_at
       ) VALUES (
         @action, @objectType, @objectId, @objectLabel,
         @actorKind, @actorId, @actorEmail, @actorRole,
         @impersonatorId, @impersonatorEmail, @impersonatorRole,
         @scopeAdminId, @scopeOperatorId, @detail, @createdAt
       )`,
    )
    .run({
      action: input.action,
      objectType: input.objectType,
      objectId: input.objectId ?? null,
      objectLabel: input.objectLabel ?? null,
      actorKind: identity ? "user" : (input.actor as string),
      actorId: identity?.id ?? null,
      actorEmail: identity?.email ?? null,
      actorRole: identity?.role ?? null,
      // Recorded only when the action really was performed through someone
      // else's identity - this is the "via impersonation by ..." marker (§2.2).
      impersonatorId: actor?.impersonating ? actor.account.id : null,
      impersonatorEmail: actor?.impersonating ? actor.account.email : null,
      impersonatorRole: actor?.impersonating ? actor.account.role : null,
      scopeAdminId: scope.adminId ?? null,
      scopeOperatorId: scope.operatorId ?? null,
      detail: input.detail ? JSON.stringify(input.detail) : null,
      createdAt: now(),
    });
};

export type ActivityQueryT = {
  /** Restrict to one admin's subtree - the superadmin's per-admin filter. */
  adminId?: string | undefined;
  /** Restrict to one operator. */
  operatorId?: string | undefined;
  limit: number;
  offset: number;
};

export type ActivityPageT = {
  entries: Array<ActivityEntryT>;
  total: number;
};

/**
 * Read the trail. The caller has already decided what the actor may see and
 * passes it in as a filter; this function does not re-derive authority.
 */
export const list = (query: ActivityQueryT): ActivityPageT => {
  const where: Array<string> = [];
  const params: Record<string, unknown> = {};

  if (query.adminId !== undefined) {
    where.push("scope_admin_id = @adminId");
    params.adminId = query.adminId;
  }
  if (query.operatorId !== undefined) {
    where.push("scope_operator_id = @operatorId");
    params.operatorId = query.operatorId;
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { total } = db()
    .prepare<Record<string, unknown>, { total: number }>(
      `SELECT COUNT(*) AS total FROM activity ${clause}`,
    )
    .get(params)!;

  const rows = db()
    .prepare<Record<string, unknown>, ActivityRow>(
      `SELECT * FROM activity ${clause} ORDER BY id DESC LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: query.limit, offset: query.offset });

  return { entries: rows.map(toActivityEntry), total };
};

/** Last activity timestamp per account - the operator and admin list summaries. */
export const lastActivityAt = (scope: "operator" | "admin", ids: Array<string>) => {
  if (!ids.length) return new Map<string, string>();

  const column = scope === "operator" ? "scope_operator_id" : "scope_admin_id";
  const placeholders = ids.map(() => "?").join(", ");

  const rows = db()
    .prepare<Array<string>, { key: string; at: string }>(
      `SELECT ${column} AS key, MAX(created_at) AS at
         FROM activity
        WHERE ${column} IN (${placeholders})
        GROUP BY ${column}`,
    )
    .all(...ids);

  return new Map(rows.map(({ key, at }) => [key, at]));
};
