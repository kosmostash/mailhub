import * as testAddresses from "@/domain/testAddresses";

import { defineRoute } from "_/api";

import { type TestAddressViewT, testAddressView } from "~/types/views";

/**
 * An operator's test addresses (§2.5), newest first - the "send to me" control
 * defaults to the first entry, so the one you just added is the one it offers.
 *
 * They belong to the acting identity, which is what makes test sending work
 * under impersonation: an admin standing in an operator's shoes uses that
 * operator's list, not a list of their own, because they have none.
 */
export default defineRoute<"account/test-addresses">(({ GET, POST }) => [
  GET<{
    response: [200, "json", { testAddresses: Array<TestAddressViewT> }];
  }>(async (ctx) => {
    const { identity } = ctx.get("actor");
    const list = identity.role === "operator" ? testAddresses.listFor(identity.id) : [];

    return ctx.json({ testAddresses: list.map(testAddressView) });
  }),

  POST<{
    json: {
      address: VRefine<string, { format: "email", maxLength: 320 }>;
      label?: VRefine<string, { maxLength: 80 }>;
    };
    response: [201, "json", TestAddressViewT];
  }>(async (ctx) => {
    const { address, label } = ctx.validated.json;

    const entry = testAddresses.create(ctx.get("actor"), {
      address,
      ...(label === undefined ? {} : { label }),
    });

    return ctx.json(testAddressView(entry), 201);
  }),
]);
