import nodemailer from "nodemailer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import * as accounts from "@/domain/accounts";
import * as confirmations from "@/domain/confirmations";
import { MailhubError } from "@/domain/errors";
import * as sessions from "@/domain/sessions";
import * as systemMail from "@/domain/systemMail";

import { buildWorld, impersonatingActor, password, resetDatabase, type WorldT } from "./helpers";
import { type SinkT, startSmtpSink } from "./smtpSink";

const codeOf = async (fn: () => unknown): Promise<string | null> => {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof MailhubError ? error.code : `unexpected: ${String(error)}`;
  }
};

/** Pull the six-digit code out of the message the sink received. */
const codeSentTo = (sink: SinkT, recipient: string): string => {
  const message = [...sink.messages].reverse().find((entry) => entry.to.includes(recipient));
  if (!message) throw new Error(`no system email was sent to ${recipient}`);
  const match = /confirmation code is: (\d{6})/.exec(message.data.replace(/=\r?\n/g, ""));
  if (!match) throw new Error(`no code in the message to ${recipient}`);
  return match[1]!;
};

describe("the credential-change gate (§2.1.7, §2.1.8)", () => {
  let world: WorldT;
  let sink: SinkT;

  beforeEach(async () => {
    await resetDatabase();
    sink = await startSmtpSink();
    // System mail goes out through the installation's own path, independent of
    // the providers admins manage - here, straight at the sink.
    systemMail.setTransport(
      nodemailer.createTransport({ host: "127.0.0.1", port: sink.port, secure: false }),
    );
    world = await buildWorld();
  });

  afterEach(async () => {
    systemMail.setTransport(undefined);
    await sink.close();
  });

  it("sends the email-change code to the NEW address, and holds the old one until confirmed", async () => {
    const actor = world.operatorActor;
    const pending = await confirmations.requestEmailChange(actor, "moved@mailhub.test");

    expect(pending.sentTo).toBe("moved@mailhub.test");
    expect(pending.via).toBe("email_code");
    // Until the code comes back, the account keeps the address it had.
    expect(accounts.mustFind(actor.identity.id).email).toBe("o1@mailhub.test");

    const code = codeSentTo(sink, "moved@mailhub.test");
    const updated = await confirmations.confirm(actor, "email", code);

    expect(updated.email).toBe("moved@mailhub.test");
    expect(accounts.findByEmail("moved@mailhub.test")).toBeDefined();
  });

  it("sends the password-change code to the address currently on the account", async () => {
    const actor = world.operatorActor;
    const pending = await confirmations.requestPasswordChange(actor, {
      currentPassword: password,
      newPassword: "a-brand-new-passphrase",
    });

    expect(pending.sentTo).toBe("o1@mailhub.test");

    // Nothing changes before the code is entered.
    expect(await sessions.signIn("o1@mailhub.test", password)).toBeTruthy();
    expect(await codeOf(() => sessions.signIn("o1@mailhub.test", "a-brand-new-passphrase"))).toBe(
      "bad_credentials",
    );

    await confirmations.confirm(actor, "password", codeSentTo(sink, "o1@mailhub.test"));

    expect(await sessions.signIn("o1@mailhub.test", "a-brand-new-passphrase")).toBeTruthy();
    expect(await codeOf(() => sessions.signIn("o1@mailhub.test", password))).toBe(
      "bad_credentials",
    );
  });

  it("gates the superadmin too", async () => {
    await confirmations.requestEmailChange(world.superadminActor, "newroot@mailhub.test");
    expect(await codeOf(() => confirmations.confirm(world.superadminActor, "email", "000000"))).toBe(
      "bad_code",
    );
    expect(accounts.mustFind(world.superadmin.id).email).toBe("root@mailhub.test");

    await confirmations.confirm(
      world.superadminActor,
      "email",
      codeSentTo(sink, "newroot@mailhub.test"),
    );
    expect(accounts.mustFind(world.superadmin.id).email).toBe("newroot@mailhub.test");
  });

  it("requires the current password before it will even send a code", async () => {
    expect(
      await codeOf(() =>
        confirmations.requestPasswordChange(world.operatorActor, {
          currentPassword: "not-it",
          newPassword: "a-brand-new-passphrase",
        }),
      ),
    ).toBe("bad_credentials");
  });

  it("uses a code once and gives up after too many wrong tries", async () => {
    const actor = world.operatorActor;
    await confirmations.requestEmailChange(actor, "moved@mailhub.test");
    const code = codeSentTo(sink, "moved@mailhub.test");

    await confirmations.confirm(actor, "email", code);
    // The code is consumed with the change: there is nothing left to confirm.
    expect(await codeOf(() => confirmations.confirm(actor, "email", code))).toBe("not_found");

    await confirmations.requestEmailChange(actor, "again@mailhub.test");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await codeOf(() => confirmations.confirm(actor, "email", "111111"))).toBe("bad_code");
    }
    expect(await codeOf(() => confirmations.confirm(actor, "email", "111111"))).toBe(
      "too_many_attempts",
    );
  });

  it("throttles repeated code requests so the gate is not a mail cannon", async () => {
    const actor = world.operatorActor;
    for (let request = 0; request < 5; request += 1) {
      await confirmations.requestEmailChange(actor, `move${request}@mailhub.test`);
    }
    expect(
      await codeOf(() => confirmations.requestEmailChange(actor, "one-too-many@mailhub.test")),
    ).toBe("rate_limited");
  });

  it("records system email in storage, and never as a stored email", async () => {
    await confirmations.requestEmailChange(world.operatorActor, "moved@mailhub.test");

    const { n: recorded } = db()
      .prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM system_emails")
      .get()!;
    const { n: stored } = db()
      .prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM emails")
      .get()!;

    expect(recorded).toBe(1);
    // System email never enters a collection, so it shows up in no email list.
    expect(stored).toBe(0);
  });

  it("refuses an address someone else already has", async () => {
    expect(
      await codeOf(() =>
        confirmations.requestEmailChange(world.operatorActor, world.adminOne.email),
      ),
    ).toBe("email_taken");
  });

  it("will not let an impersonator change the assumed account's credentials", async () => {
    const acting = impersonatingActor(world.adminOne, world.operator);
    expect(
      await codeOf(() => confirmations.requestEmailChange(acting, "hijack@mailhub.test")),
    ).toBe("impersonating");
  });

  it("keeps administrative resets outside the gate (§2.1.1/§2.1.2)", async () => {
    // No code, no current password: this is the recovery path for an account
    // that cannot complete the confirmation flow.
    await accounts.resetPassword(world.adminOneActor, world.operator.id, "reset-by-the-admin");
    expect(await sessions.signIn(world.operator.email, "reset-by-the-admin")).toBeTruthy();
  });
});
