import { notFound } from "@/domain/errors";
import * as providers from "@/domain/providers";

import { defineRoute } from "_/api";

import { toProviderView, usageCounts } from "~/server/providers";
import type { ProviderViewT } from "~/types/views";

/**
 * One provider (§5.6). Deleting one that is still assigned to any collection
 * is refused with a conflict - the collection would silently stop sending.
 */
export default defineRoute<"providers/[id]", [
  VRefine<string, { format: "uuid" }>,
]>(({ GET, PUT, DELETE }) => [
  GET<{
    response: [200, "json", ProviderViewT];
  }>(async (ctx) => {
    const provider = providers.findById(ctx.validated.params.id);
    if (!provider || provider.adminId !== ctx.get("admin").id) throw notFound("Provider");

    return ctx.json(toProviderView(provider, usageCounts([provider]).get(provider.id) ?? 0));
  }),

  PUT<{
    json: {
      name?: VRefine<string, { minLength: 1, maxLength: 120 }>;
      type?: VRefine<string, { minLength: 1, maxLength: 40 }>;
      config?: { [key: string]: string | number | boolean | null };
    };
    response: [200, "json", ProviderViewT];
  }>(async (ctx) => {
    const { name, type, config } = ctx.validated.json;

    const provider = providers.update(ctx.get("actor"), ctx.validated.params.id, {
      ...(name === undefined ? {} : { name }),
      ...(type === undefined ? {} : { type }),
      ...(config === undefined ? {} : { config }),
    });

    return ctx.json(toProviderView(provider, usageCounts([provider]).get(provider.id) ?? 0));
  }),

  DELETE<{
    response: [200, "json", { ok: true }];
  }>(async (ctx) => {
    providers.remove(ctx.get("actor"), ctx.validated.params.id);
    return ctx.json({ ok: true } as const);
  }),
]);
