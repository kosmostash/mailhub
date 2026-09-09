import { db, transaction } from "@/db";
import { type CollectionRow, toCollection } from "@/db/rows";

import * as accounts from "./accounts";
import * as activity from "./activity";
import { now } from "./clock";
import { conflict, forbidden, invalid, notFound, unauthorized } from "./errors";
import { newCollectionId } from "./ids";
import * as providers from "./providers";
import type {
  ActorT,
  CollectionCountersT,
  CollectionT,
  ScheduleModeT,
  UserT,
} from "./types";

/**
 * Collections (§2.3) - the unit of tenancy toward client projects.
 *
 * A collection's id is its API key, which drives two rules enforced here: it is
 * generated unguessably, and it is never regenerated - not on rename, not on
 * reassignment, so a client project's configuration never goes stale.
 */

const requireOperator = (actor: ActorT): UserT => {
  if (actor.identity.role !== "operator") {
    throw forbidden(
      "Collections are managed by operators - impersonate one to act",
      "wrong_role",
    );
  }
  return actor.identity;
};

export const findById = (id: string): CollectionT | undefined => {
  const row = db()
    .prepare<[string], CollectionRow>("SELECT * FROM collections WHERE id = ?")
    .get(id);
  return row && toCollection(row);
};

export const listForOperator = (operatorId: string): Array<CollectionT> =>
  db()
    .prepare<[string], CollectionRow>(
      "SELECT * FROM collections WHERE operator_id = ? ORDER BY name",
    )
    .all(operatorId)
    .map(toCollection);

/** The collection as `actor` may see it, or `undefined` when out of scope (§6). */
export const visible = (actor: ActorT, collectionId: string): CollectionT | undefined => {
  const collection = findById(collectionId);
  if (!collection) return undefined;

  const { identity } = actor;
  if (identity.role === "superadmin") return collection;
  if (identity.role === "operator") {
    return collection.operatorId === identity.id ? collection : undefined;
  }

  const owner = accounts.findById(collection.operatorId);
  return owner?.adminId === identity.id ? collection : undefined;
};

export const mustSee = (actor: ActorT, collectionId: string): CollectionT => {
  const collection = visible(actor, collectionId);
  if (!collection) throw notFound("Collection");
  return collection;
};

/** Everything `actor` may browse, with its owner attached for admin views. */
export const listVisible = (actor: ActorT): Array<{ collection: CollectionT; owner: UserT }> => {
  const owners = accounts.visibleOperators(actor);
  return owners.flatMap((owner) =>
    listForOperator(owner.id).map((collection) => ({ collection, owner })),
  );
};

const emptyCounters = (): CollectionCountersT => ({
  total: 0,
  pending: 0,
  ready: 0,
  sent: 0,
  delivered: 0,
  bounced: 0,
});

/**
 * Live counts for a set of collections, in one query rather than one per card -
 * the dashboard asks for every collection an admin can see.
 */
export const counters = (collectionIds: Array<string>): Map<string, CollectionCountersT> => {
  const result = new Map(collectionIds.map((id) => [id, emptyCounters()]));
  if (!collectionIds.length) return result;

  const placeholders = collectionIds.map(() => "?").join(", ");
  const rows = db()
    .prepare<Array<string>, { collection_id: string; state: string; delivery_status: string; n: number }>(
      `SELECT collection_id, state, delivery_status, COUNT(*) AS n
         FROM emails
        WHERE collection_id IN (${placeholders})
        GROUP BY collection_id, state, delivery_status`,
    )
    .all(...collectionIds);

  for (const row of rows) {
    const counts = result.get(row.collection_id);
    if (!counts) continue;
    counts.total += row.n;
    if (row.state === "pending") counts.pending += row.n;
    if (row.state === "ready") counts.ready += row.n;
    if (row.state === "sent") counts.sent += row.n;
    if (row.delivery_status === "delivered") counts.delivered += row.n;
    if (row.delivery_status === "bounced") counts.bounced += row.n;
  }

  return result;
};

const assertName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw invalid("Collection name is required", "invalid_collection_name");
  return trimmed;
};

/**
 * Only a provider of the operator's own admin may be assigned: the admin
 * boundary *is* the provider boundary (§2.4).
 */
const assertAssignable = (operator: UserT, providerId: string | null): string | null => {
  if (!providerId) return null;
  const provider = providers.findById(providerId);
  if (!provider || provider.adminId !== operator.adminId) throw notFound("Provider");
  return provider.id;
};

export const create = (
  actor: ActorT,
  input: { name: string; scheduleMode: ScheduleModeT; providerId?: string | null },
): CollectionT => {
  const operator = requireOperator(actor);
  const name = assertName(input.name);
  const providerId = assertAssignable(operator, input.providerId ?? null);

  if (listForOperator(operator.id).some((collection) => collection.name === name)) {
    throw conflict("You already have a collection with that name", "collection_name_taken");
  }

  const timestamp = now();
  const collection: CollectionT = {
    id: newCollectionId(),
    operatorId: operator.id,
    name,
    scheduleMode: input.scheduleMode,
    providerId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db()
    .prepare(
      `INSERT INTO collections (id, operator_id, name, schedule_mode, provider_id, created_at, updated_at)
       VALUES (@id, @operatorId, @name, @scheduleMode, @providerId, @createdAt, @updatedAt)`,
    )
    .run(collection);

  activity.record({
    action: "collection.create",
    objectType: "collection",
    objectId: collection.id,
    objectLabel: collection.name,
    actor,
    detail: { scheduleMode: collection.scheduleMode },
  });

  return collection;
};

export const update = (
  actor: ActorT,
  collectionId: string,
  input: { name?: string; scheduleMode?: ScheduleModeT; providerId?: string | null },
): CollectionT => {
  const operator = requireOperator(actor);
  const existing = findById(collectionId);
  if (!existing || existing.operatorId !== operator.id) throw notFound("Collection");

  const name = input.name === undefined ? existing.name : assertName(input.name);
  const scheduleMode = input.scheduleMode ?? existing.scheduleMode;
  const providerId =
    input.providerId === undefined
      ? existing.providerId
      : assertAssignable(operator, input.providerId);

  if (
    name !== existing.name &&
    listForOperator(operator.id).some((collection) => collection.name === name)
  ) {
    throw conflict("You already have a collection with that name", "collection_name_taken");
  }

  const updatedAt = now();
  db()
    .prepare(
      "UPDATE collections SET name = ?, schedule_mode = ?, provider_id = ?, updated_at = ? WHERE id = ?",
    )
    .run(name, scheduleMode, providerId, updatedAt, collectionId);

  activity.record({
    action: "collection.update",
    objectType: "collection",
    objectId: collectionId,
    objectLabel: name,
    actor,
    detail: { scheduleMode, providerId },
  });

  return { ...existing, name, scheduleMode, providerId, updatedAt };
};

/** Deletes the collection and its emails (§5.3) - destructive, hence confirmed in the UI. */
export const remove = (actor: ActorT, collectionId: string): void => {
  const operator = requireOperator(actor);
  const existing = findById(collectionId);
  if (!existing || existing.operatorId !== operator.id) throw notFound("Collection");

  const removed = transaction(() => {
    const emails = db()
      .prepare("DELETE FROM emails WHERE collection_id = ?")
      .run(collectionId).changes;
    db().prepare("DELETE FROM collections WHERE id = ?").run(collectionId);
    return emails;
  });

  activity.record({
    action: "collection.delete",
    objectType: "collection",
    objectId: collectionId,
    objectLabel: existing.name,
    actor,
    detail: { emails: removed },
  });
};

/**
 * Resolve a collection id presented as a credential by the submission API or
 * the SMTP listener (§3.1, §3.6).
 *
 * The two failure modes are deliberately distinguishable: an id that names
 * nothing is 401 (fix your configuration), while a suspended owner is 403
 * (reach for a human). Everything that accepts email goes through here.
 */
export const authorizeSubmission = (
  collectionId: string | undefined,
): { collection: CollectionT; operator: UserT } => {
  const collection = collectionId ? findById(collectionId) : undefined;
  if (!collection) {
    throw unauthorized("Unknown or missing collection id", "unknown_collection");
  }

  const operator = accounts.mustFind(collection.operatorId);
  if (accounts.isSuspended(operator)) {
    throw forbidden(
      "This collection is suspended - its operator or admin has been disabled",
      "collection_suspended",
    );
  }

  return { collection, operator };
};
