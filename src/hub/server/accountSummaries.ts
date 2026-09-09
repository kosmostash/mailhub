import * as accounts from "@/domain/accounts";
import * as activity from "@/domain/activity";
import * as collections from "@/domain/collections";
import * as providers from "@/domain/providers";
import type { UserT } from "@/domain/types";

import type { AdminSummaryT, OperatorSummaryT } from "~/types/views";

/**
 * The per-account summaries behind the operators page (§5.7) and the admins
 * page (§5.8).
 *
 * The two pages are mirror images one level apart, so their summaries are
 * built the same way and differ only in what "holds something" means:
 * collections for an operator, operators and providers for an admin. That is
 * also what `deletable` reports - the §2.1.6 rule, computed once here rather
 * than restated in the UI.
 */

const countersFor = (operators: Array<UserT>) => {
  const owned = operators.flatMap((operator) =>
    collections.listForOperator(operator.id).map((collection) => ({ operator, collection })),
  );
  const counters = collections.counters(owned.map(({ collection }) => collection.id));

  const perOperator = new Map(operators.map(({ id }) => [id, { collections: 0, pending: 0 }]));
  for (const { operator, collection } of owned) {
    const bucket = perOperator.get(operator.id)!;
    bucket.collections += 1;
    bucket.pending += counters.get(collection.id)?.pending ?? 0;
  }

  return perOperator;
};

export const operatorSummaries = (adminId: string): Array<OperatorSummaryT> => {
  const operators = accounts.listOperators(adminId);
  const counters = countersFor(operators);
  const lastSeen = activity.lastActivityAt(
    "operator",
    operators.map(({ id }) => id),
  );

  return operators.map((operator) => {
    const counts = counters.get(operator.id)!;
    return {
      id: operator.id,
      email: operator.email,
      disabled: operator.disabledAt !== null,
      collections: counts.collections,
      pending: counts.pending,
      lastActivityAt: lastSeen.get(operator.id) ?? null,
      deletable: operator.disabledAt !== null && counts.collections === 0,
    };
  });
};

export const adminSummaries = (): Array<AdminSummaryT> => {
  const admins = accounts.listAdmins();
  const lastSeen = activity.lastActivityAt(
    "admin",
    admins.map(({ id }) => id),
  );

  return admins.map((admin) => {
    const operators = accounts.listOperators(admin.id);
    const counters = countersFor(operators);
    const providerCount = providers.listForAdmin(admin.id).length;

    let collectionCount = 0;
    let pending = 0;
    for (const operator of operators) {
      const counts = counters.get(operator.id)!;
      collectionCount += counts.collections;
      pending += counts.pending;
    }

    return {
      id: admin.id,
      email: admin.email,
      disabled: admin.disabledAt !== null,
      operators: operators.length,
      providers: providerCount,
      collections: collectionCount,
      pending,
      lastActivityAt: lastSeen.get(admin.id) ?? null,
      deletable: admin.disabledAt !== null && operators.length === 0 && providerCount === 0,
    };
  });
};
