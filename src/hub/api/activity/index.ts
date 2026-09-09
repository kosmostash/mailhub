import * as accounts from "@/domain/accounts";
import * as activity from "@/domain/activity";
import { forbidden, notFound } from "@/domain/errors";

import { defineRoute } from "_/api";

import { type ActivityViewT, activityView } from "~/types/views";

type ActivityPageViewT = {
  entries: Array<ActivityViewT>;
  total: number;
  limit: number;
  offset: number;
  /** Who the trail can be narrowed to, for the filter control (§5.9). */
  operators: Array<{ id: string; email: string }>;
  admins: Array<{ id: string; email: string }>;
};

/**
 * The activity trail (§5.9), newest first, read-only for everyone.
 *
 * What a caller may see is decided here rather than by the query: the
 * superadmin sees every trail including the admins' own actions, an admin sees
 * all their operators', and an operator sees their own and nobody else's. A
 * filter that reaches outside that scope is a 404, exactly like a filter
 * naming an account that does not exist (§6).
 */
export default defineRoute<"activity">(({ GET }) => [
  GET<{
    query: {
      operatorId?: VRefine<string, { format: "uuid" }>;
      adminId?: VRefine<string, { format: "uuid" }>;
      limit?: VRefine<number, { minimum: 1, maximum: 200, multipleOf: 1 }>;
      offset?: VRefine<number, { minimum: 0, multipleOf: 1 }>;
    };
    response: [200, "json", ActivityPageViewT];
  }>(async (ctx) => {
    const { identity } = ctx.get("actor");
    const limit = ctx.validated.query.limit ?? 50;
    const offset = ctx.validated.query.offset ?? 0;
    const asked = ctx.validated.query;

    let operatorId: string | undefined;
    let adminId: string | undefined;

    if (identity.role === "operator") {
      // An operator may be shown their own trail; they never see anyone else's.
      operatorId = identity.id;
    } else if (identity.role === "admin") {
      adminId = identity.id;
      if (asked.operatorId) {
        if (!accounts.visibleOperator(ctx.get("actor"), asked.operatorId)) {
          throw notFound("Operator");
        }
        operatorId = asked.operatorId;
      }
      if (asked.adminId && asked.adminId !== identity.id) {
        throw forbidden("Admins cannot read each other's trails", "out_of_scope");
      }
    } else {
      // The superadmin filters freely, by admin and by operator.
      if (asked.adminId) adminId = asked.adminId;
      if (asked.operatorId) operatorId = asked.operatorId;
    }

    const page = activity.list({ operatorId, adminId, limit, offset });

    const visibleOperators = accounts.visibleOperators(ctx.get("actor"));

    return ctx.json({
      entries: page.entries.map(activityView),
      total: page.total,
      limit,
      offset,
      operators: visibleOperators.map(({ id, email }) => ({ id, email })),
      admins:
        identity.role === "superadmin"
          ? accounts.listAdmins().map(({ id, email }) => ({ id, email }))
          : [],
    });
  }),
]);
