import * as emails from "@/domain/emails";
import { type EmailViewT, emailView } from "@/domain/wire";

import { defineRoute } from "_/api";

/**
 * One email in full (§5.5): envelope, both bodies, lifecycle state, delivery
 * status, attempts, last error, timestamps.
 *
 * Readable by every role that can see it - preview included, which is why an
 * admin observing read-only still gets the html body. Rendering it safely is
 * the UI's job, in an isolated frame.
 */
export default defineRoute<"emails/[id]", [
  VRefine<string, { format: "uuid" }>,
]>(({ GET }) => [
  GET<{
    response: [200, "json", EmailViewT];
  }>(async (ctx) => {
    return ctx.json(emailView(emails.mustSee(ctx.get("actor"), ctx.validated.params.id)));
  }),
]);
