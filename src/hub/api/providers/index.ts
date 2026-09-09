import { providerTypes } from "@/domain/delivery";
import * as providers from "@/domain/providers";

import { defineRoute } from "_/api";

import { toProviderView, usageCounts } from "~/server/providers";
import type { ProviderViewT } from "~/types/views";

type ProviderListViewT = {
  providers: Array<ProviderViewT>;
  /** What this installation can speak, and which types actually deliver (§2.4). */
  types: Array<{ type: string; label: string; implemented: boolean }>;
};

/**
 * The admin's providers (§5.6).
 *
 * Configurations come back with their secrets masked - the admin editing one
 * re-enters the password rather than reading it back out of a list view.
 */
export default defineRoute<"providers">(({ GET, POST }) => [
  GET<{
    response: [200, "json", ProviderListViewT];
  }>(async (ctx) => {
    const list = providers.listForAdmin(ctx.get("admin").id);
    const counts = usageCounts(list);

    return ctx.json({
      providers: list.map((provider) => toProviderView(provider, counts.get(provider.id) ?? 0)),
      // Types that are registered but not implemented are offered too: they
      // configure fine and fail a send loudly, which is the contract (§2.4).
      types: providerTypes.map(({ type, label, implemented }) => ({
        type,
        label,
        implemented,
      })),
    });
  }),

  POST<{
    json: {
      name: VRefine<string, { minLength: 1, maxLength: 120 }>;
      type: VRefine<string, { minLength: 1, maxLength: 40 }>;
      /** Validated per type by the transport factory, not by a shared schema. */
      config: { [key: string]: string | number | boolean | null };
    };
    response: [201, "json", ProviderViewT];
  }>(async (ctx) => {
    const provider = providers.create(ctx.get("actor"), ctx.validated.json);
    return ctx.json(toProviderView(provider, 0), 201);
  }),
]);
