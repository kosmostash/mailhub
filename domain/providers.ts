import { db } from "@/db";
import { type ProviderRow, toProvider } from "@/db/rows";

import * as accounts from "./accounts";
import * as activity from "./activity";
import { now } from "./clock";
import { factoryFor, isProviderType } from "./delivery";
import { conflict, forbidden, invalid, notFound } from "./errors";
import { newId } from "./ids";
import type { ActorT, ProviderT, ProviderTypeT } from "./types";

/**
 * Providers (§2.4) - the one write domain admins hold in their own identity,
 * because delivery credentials are infrastructure rather than day-to-day
 * material.
 *
 * Two boundaries matter here and both are enforced in this module: every
 * provider of an admin is available to every one of that admin's operators,
 * and no operator ever sees a configuration.
 */

export type ProviderChoiceT = { id: string; name: string; type: ProviderTypeT };

const requireAdmin = (actor: ActorT): string => {
  if (actor.identity.role !== "admin") {
    throw forbidden("Managing providers requires an admin identity", "wrong_role");
  }
  return actor.identity.id;
};

export const findById = (id: string): ProviderT | undefined => {
  const row = db()
    .prepare<[string], ProviderRow>("SELECT * FROM providers WHERE id = ?")
    .get(id);
  return row && toProvider(row);
};

export const listForAdmin = (adminId: string): Array<ProviderT> =>
  db()
    .prepare<[string], ProviderRow>("SELECT * FROM providers WHERE admin_id = ? ORDER BY name")
    .all(adminId)
    .map(toProvider);

/**
 * What an operator may know about their admin's providers: a name and a type
 * to pick from, never a configuration (§2.4).
 */
export const choicesFor = (actor: ActorT): Array<ProviderChoiceT> => {
  const adminId = accounts.adminIdOf(actor.identity);
  if (!adminId) return [];
  return listForAdmin(adminId).map(({ id, name, type }) => ({ id, name, type }));
};

/** The provider as `actor` may see it, or `undefined` when out of scope. */
export const visible = (actor: ActorT, providerId: string): ProviderT | undefined => {
  const provider = findById(providerId);
  if (!provider) return undefined;

  const { identity } = actor;
  if (identity.role === "superadmin") return provider;
  if (identity.role === "admin") return provider.adminId === identity.id ? provider : undefined;
  // An operator can confirm that a provider is theirs to assign, but reads it
  // through `choicesFor` - never with its configuration attached.
  return provider.adminId === identity.adminId ? provider : undefined;
};

/** A provider with its secrets masked, for display (§5.6). */
export const redacted = (provider: ProviderT): ProviderT => ({
  ...provider,
  config: factoryFor(provider.type).redact(provider.config),
});

const assertName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw invalid("Provider name is required", "invalid_provider_name");
  return trimmed;
};

const assertType = (type: string): ProviderTypeT => {
  if (!isProviderType(type)) {
    throw invalid(`Unknown provider type: ${type}`, "unknown_provider_type");
  }
  return type;
};

export const create = (
  actor: ActorT,
  input: { name: string; type: string; config: unknown },
): ProviderT => {
  const adminId = requireAdmin(actor);
  const name = assertName(input.name);
  const type = assertType(input.type);
  const config = factoryFor(type).validateConfig(input.config);

  if (listForAdmin(adminId).some((provider) => provider.name === name)) {
    throw conflict("You already have a provider with that name", "provider_name_taken");
  }

  const timestamp = now();
  const provider: ProviderT = {
    id: newId(),
    adminId,
    name,
    type,
    config,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db()
    .prepare(
      `INSERT INTO providers (id, admin_id, name, type, config, created_at, updated_at)
       VALUES (@id, @adminId, @name, @type, @config, @createdAt, @updatedAt)`,
    )
    .run({ ...provider, config: JSON.stringify(config) });

  activity.record({
    action: "provider.create",
    objectType: "provider",
    objectId: provider.id,
    objectLabel: provider.name,
    actor,
    detail: { type },
  });

  return provider;
};

export const update = (
  actor: ActorT,
  providerId: string,
  input: { name?: string; type?: string; config?: unknown },
): ProviderT => {
  const adminId = requireAdmin(actor);
  const existing = findById(providerId);
  if (!existing || existing.adminId !== adminId) throw notFound("Provider");

  const name = input.name === undefined ? existing.name : assertName(input.name);
  const type = input.type === undefined ? existing.type : assertType(input.type);

  /**
   * An update merges over what is stored, rather than replacing it.
   *
   * That is what lets an edit form show a masked password and leave the field
   * empty to keep it: omitting a key means "unchanged", and the secret never
   * has to travel back to the browser to survive a rename. Changing the *type*
   * is the exception - the old configuration means nothing under a new type,
   * so it is replaced and re-validated wholesale.
   */
  const merged =
    input.config === undefined
      ? existing.config
      : type === existing.type
        ? { ...existing.config, ...input.config }
        : input.config;

  const config = factoryFor(type).validateConfig(merged);

  if (
    name !== existing.name &&
    listForAdmin(adminId).some((provider) => provider.name === name)
  ) {
    throw conflict("You already have a provider with that name", "provider_name_taken");
  }

  const updatedAt = now();
  db()
    .prepare(
      `UPDATE providers SET name = ?, type = ?, config = ?, updated_at = ? WHERE id = ?`,
    )
    .run(name, type, JSON.stringify(config), updatedAt, providerId);

  activity.record({
    action: "provider.update",
    objectType: "provider",
    objectId: providerId,
    objectLabel: name,
    actor,
  });

  return { ...existing, name, type, config, updatedAt };
};

export const remove = (actor: ActorT, providerId: string): void => {
  const adminId = requireAdmin(actor);
  const existing = findById(providerId);
  if (!existing || existing.adminId !== adminId) throw notFound("Provider");

  const assigned = db()
    .prepare<[string], { n: number }>(
      "SELECT COUNT(*) AS n FROM collections WHERE provider_id = ?",
    )
    .get(providerId)!.n;

  if (assigned > 0) {
    throw conflict(
      `This provider is still assigned to ${assigned} collection${assigned === 1 ? "" : "s"}`,
      "provider_in_use",
      { collections: assigned },
    );
  }

  db().prepare("DELETE FROM providers WHERE id = ?").run(providerId);

  activity.record({
    action: "provider.delete",
    objectType: "provider",
    objectId: providerId,
    objectLabel: existing.name,
    actor,
  });
};
