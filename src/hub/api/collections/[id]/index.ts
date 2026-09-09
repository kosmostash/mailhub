import * as collections from "@/domain/collections";

import { defineRoute } from "_/api";

import { cardFor } from "~/server/cards";
import type { CollectionCardT } from "~/types/views";

/**
 * One collection (§5.3, §5.4).
 *
 * Reading is open to every role that can see it - an operator's own, an
 * admin's operators', everything for the superadmin - and out-of-scope ids
 * answer 404 exactly like missing ones, so scoping leaks nothing (§6).
 *
 * Writing is the operator's alone; the domain refuses it in any other
 * identity, impersonation included in the sense that matters: an admin
 * impersonating the operator *is* an operator here.
 */
export default defineRoute<"collections/[id]", [
  VRefine<string, { minLength: 4, maxLength: 64 }>,
]>(({ GET, PUT, DELETE }) => [
  GET<{
    response: [200, "json", CollectionCardT];
  }>(async (ctx) => {
    const collection = collections.mustSee(ctx.get("actor"), ctx.validated.params.id);
    return ctx.json(cardFor(collection));
  }),

  PUT<{
    json: {
      name?: VRefine<string, { minLength: 1, maxLength: 120 }>;
      scheduleMode?: "after_review" | "immediate";
      /** `null` clears the provider; omitted leaves it alone. */
      providerId?: VRefine<string, { format: "uuid" }> | null;
    };
    response: [200, "json", CollectionCardT];
  }>(async (ctx) => {
    const { name, scheduleMode, providerId } = ctx.validated.json;

    const collection = collections.update(ctx.get("actor"), ctx.validated.params.id, {
      ...(name === undefined ? {} : { name }),
      ...(scheduleMode === undefined ? {} : { scheduleMode }),
      ...(providerId === undefined ? {} : { providerId }),
    });

    return ctx.json(cardFor(collection));
  }),

  DELETE<{
    response: [200, "json", { ok: true }];
  }>(async (ctx) => {
    // Removes the collection and its emails - destructive, hence confirmed in
    // the UI before it gets here (§5.3).
    collections.remove(ctx.get("actor"), ctx.validated.params.id);
    return ctx.json({ ok: true } as const);
  }),
]);
