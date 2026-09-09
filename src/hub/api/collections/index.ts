import * as collections from "@/domain/collections";

import { defineRoute } from "_/api";

import { cardFor } from "~/server/cards";
import type { CollectionCardT } from "~/types/views";

/**
 * Create a collection (§5.3).
 *
 * Listing lives on the dashboard, which every role reads; creating is an
 * operator's write, and the domain refuses it in any other identity - which is
 * also why there is no `use.ts` gating this subtree: the routes beneath it mix
 * reads every role may make with writes only an operator may.
 */
export default defineRoute<"collections">(({ POST }) => [
  POST<{
    json: {
      name: VRefine<string, { minLength: 1, maxLength: 120 }>;
      scheduleMode: "after_review" | "immediate";
      /** One of the operator's admin's providers, or none (§2.3). */
      providerId?: VRefine<string, { format: "uuid" }> | null;
    };
    response: [201, "json", CollectionCardT];
  }>(async (ctx) => {
    const { name, scheduleMode, providerId } = ctx.validated.json;

    const collection = collections.create(ctx.get("actor"), {
      name,
      scheduleMode,
      providerId: providerId ?? null,
    });

    return ctx.json(cardFor(collection), 201);
  }),
]);
