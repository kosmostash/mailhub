import * as emails from "@/domain/emails";
import { type EmailViewT, type SubmitEmailPayloadT, emailView } from "@/domain/wire";

import { defineRoute } from "_/api";

/**
 * Submit an email - `POST /api/emails` (§3.2).
 *
 * Submission only stores. The response never waits for a send: the email lands
 * `pending` or `ready` according to its collection's schedule mode, and the
 * background sender takes it from there.
 */
export default defineRoute<"emails">(({ POST }) => [
  POST<{
    json: SubmitEmailPayloadT;
    response: [201, "json", EmailViewT];
  }>(async (ctx) => {
    const collection = ctx.get("collection");
    const payload = ctx.validated.json;

    const email = emails.submit(
      collection,
      {
        from: payload.from,
        to: payload.to,
        ...(payload.cc ? { cc: payload.cc } : {}),
        ...(payload.bcc ? { bcc: payload.bcc } : {}),
        subject: payload.subject,
        ...(payload.text === undefined ? {} : { text: payload.text }),
        ...(payload.html === undefined ? {} : { html: payload.html }),
      },
      "http",
    );

    return ctx.json(emailView(email), 201);
  }),
]);
