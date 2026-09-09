import * as sender from "@/domain/sender";

import { defineRoute } from "_/api";

/**
 * Send to me (§4.4).
 *
 * A copy goes to one of the acting operator's own test addresses, marked
 * `[test]`, through the email's collection provider. The stored email is
 * untouched, which is what lets this work in every lifecycle state - including
 * `pending`, where it is most useful, and `sent`, where it is a re-read.
 */
export default defineRoute<"emails/actions/test-send">(({ POST }) => [
  POST<{
    json: {
      emailId: VRefine<string, { format: "uuid" }>;
      testAddressId: VRefine<string, { format: "uuid" }>;
    };
    response: [200, "json", { sentTo: string }];
  }>(async (ctx) => {
    const { emailId, testAddressId } = ctx.validated.json;

    const { address } = await sender.sendTestCopy(ctx.get("actor"), emailId, testAddressId);

    return ctx.json({ sentTo: address });
  }),
]);
