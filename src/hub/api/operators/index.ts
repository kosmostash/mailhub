import * as accounts from "@/domain/accounts";

import { defineRoute } from "_/api";

import { operatorSummaries } from "~/server/accountSummaries";
import type { OperatorSummaryT } from "~/types/views";

/**
 * The admin's own operators (§5.7): list with per-operator summary, and
 * create.
 *
 * Creating an operator is the only way one comes into existence - there is no
 * self-registration and no invitation flow (§7).
 */
export default defineRoute<"operators">(({ GET, POST }) => [
  GET<{
    response: [200, "json", { operators: Array<OperatorSummaryT> }];
  }>(async (ctx) => {
    return ctx.json({ operators: operatorSummaries(ctx.get("admin").id) });
  }),

  POST<{
    json: {
      email: VRefine<string, { format: "email", maxLength: 320 }>;
      /** The initial password, handed over out of band. */
      password: VRefine<string, { minLength: 10, maxLength: 512 }>;
    };
    response: [201, "json", OperatorSummaryT];
  }>(async (ctx) => {
    const { email, password } = ctx.validated.json;
    const operator = await accounts.createOperator(ctx.get("actor"), { email, password });

    const summary = operatorSummaries(ctx.get("admin").id).find(
      (entry) => entry.id === operator.id,
    )!;

    return ctx.json(summary, 201);
  }),
]);
