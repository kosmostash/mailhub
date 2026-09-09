import { db } from "@/db";
import { providerTypes } from "@/domain/delivery";
import * as providers from "@/domain/providers";
import type { ProviderT } from "@/domain/types";

import { type ProviderViewT, providerView } from "~/types/views";

/**
 * Shared shaping for the providers endpoints.
 *
 * Lives beside the routes rather than inside one of them: a route file's job
 * is its own URL, and two of them need this.
 */

/** How many collections point at each provider - what blocks deletion (§2.4). */
export const usageCounts = (list: Array<ProviderT>): Map<string, number> => {
  if (!list.length) return new Map();

  const placeholders = list.map(() => "?").join(", ");
  const rows = db()
    .prepare<Array<string>, { provider_id: string; n: number }>(
      `SELECT provider_id, COUNT(*) AS n FROM collections
        WHERE provider_id IN (${placeholders}) GROUP BY provider_id`,
    )
    .all(...list.map(({ id }) => id));

  return new Map(rows.map((row) => [row.provider_id, row.n]));
};

const isImplemented = (type: string): boolean =>
  providerTypes.find((entry) => entry.type === type)?.implemented ?? false;

/** Secrets are masked on the way out: a list view is no place for a password. */
export const toProviderView = (provider: ProviderT, collections: number): ProviderViewT =>
  providerView(providers.redacted(provider), {
    implemented: isImplemented(provider.type),
    collections,
  });
