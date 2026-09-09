import * as accounts from "@/domain/accounts";
import * as collections from "@/domain/collections";
import * as providers from "@/domain/providers";
import type { ActorT, CollectionT, UserT } from "@/domain/types";

import { type CollectionCardT, collectionCard } from "~/types/views";

/**
 * Collection cards, for the dashboard (§5.2) and the collection view (§5.4).
 *
 * The same builder serves every role: what changes is only which collections
 * `visibleOperators` hands back - an operator's own, an admin's operators', or
 * everything for the superadmin. The scoping decision lives in the domain, so
 * it cannot drift between the dashboard and the endpoints that act.
 */

const providerNames = (collectionList: Array<CollectionT>): Map<string, string> => {
  const names = new Map<string, string>();
  for (const id of new Set(collectionList.map((entry) => entry.providerId))) {
    if (!id) continue;
    const provider = providers.findById(id);
    if (provider) names.set(id, provider.name);
  }
  return names;
};

export const cardsFor = (actor: ActorT): Array<CollectionCardT> => {
  const owned = collections.listVisible(actor);
  const names = providerNames(owned.map(({ collection }) => collection));
  const counters = collections.counters(owned.map(({ collection }) => collection.id));

  // Only the superadmin sees across admins, so only the superadmin needs to
  // know which one a card belongs to - and it is resolved once per admin.
  const admins = new Map<string, UserT | undefined>();
  const adminOf = (owner: UserT): UserT | null => {
    if (actor.identity.role !== "superadmin" || !owner.adminId) return null;
    if (!admins.has(owner.adminId)) admins.set(owner.adminId, accounts.findById(owner.adminId));
    return admins.get(owner.adminId) ?? null;
  };

  return owned.map(({ collection, owner }) =>
    collectionCard({
      collection,
      owner,
      admin: adminOf(owner),
      providerName: collection.providerId
        ? (names.get(collection.providerId) ?? null)
        : null,
      counters: counters.get(collection.id)!,
    }),
  );
};

export const cardFor = (collection: CollectionT): CollectionCardT => {
  const owner: UserT = accounts.mustFind(collection.operatorId);
  const provider = collection.providerId
    ? providers.findById(collection.providerId)
    : undefined;

  return collectionCard({
    collection,
    owner,
    admin: owner.adminId ? (accounts.findById(owner.adminId) ?? null) : null,
    providerName: provider?.name ?? null,
    counters: collections.counters([collection.id]).get(collection.id)!,
  });
};
