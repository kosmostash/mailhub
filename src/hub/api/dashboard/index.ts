import * as providers from "@/domain/providers";

import { defineRoute } from "_/api";

import { cardsFor } from "~/server/cards";
import type { CollectionCardT, ProviderChoiceViewT } from "~/types/views";

type DashboardViewT = {
  collections: Array<CollectionCardT>;
  /**
   * The providers the acting identity may assign, by name and type only -
   * never a configuration (§2.4). Empty unless an operator is acting.
   */
  providerChoices: Array<ProviderChoiceViewT>;
};

/**
 * The landing view after sign-in (§5.2).
 *
 * One endpoint for every role: an operator sees their own collections, an
 * admin sees all their operators' (labelled by owner, read-only), and the
 * superadmin sees across every admin. The cards themselves are identical -
 * only the set differs, and the UI decides what controls to put on them from
 * the session's capabilities.
 */
export default defineRoute<"dashboard">(({ GET }) => [
  GET<{
    response: [200, "json", DashboardViewT];
  }>(async (ctx) => {
    const actor = ctx.get("actor");

    return ctx.json({
      collections: cardsFor(actor),
      providerChoices: providers.choicesFor(actor),
    });
  }),
]);
