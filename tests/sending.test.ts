import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as collections from "@/domain/collections";
import { closeTransports } from "@/domain/delivery";
import * as emails from "@/domain/emails";
import { MailhubError } from "@/domain/errors";
import * as providers from "@/domain/providers";
import * as sender from "@/domain/sender";
import * as testAddresses from "@/domain/testAddresses";
import type { CollectionT } from "@/domain/types";

import { buildWorld, makeCollection, resetDatabase, submission, type WorldT } from "./helpers";
import { type SinkT, startSmtpSink } from "./smtpSink";

const codeOf = async (fn: () => unknown): Promise<string | null> => {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof MailhubError ? error.code : `unexpected: ${String(error)}`;
  }
};

describe("the email lifecycle and sending (§2.7, §4)", () => {
  let world: WorldT;
  let sink: SinkT;
  let review: CollectionT;
  let immediate: CollectionT;

  beforeEach(async () => {
    await resetDatabase();
    sink = await startSmtpSink();
    world = await buildWorld();

    // Point the provider at the sink now that we know its port.
    providers.update(world.adminOneActor, world.provider.id, {
      config: { host: "127.0.0.1", port: sink.port, secure: false },
    });

    review = makeCollection(world.operatorActor, {
      name: "A",
      scheduleMode: "after_review",
      providerId: world.provider.id,
    });
    immediate = makeCollection(world.operatorActor, {
      name: "B",
      scheduleMode: "immediate",
      providerId: world.provider.id,
    });
  });

  afterEach(async () => {
    await closeTransports();
    await sink.close();
  });

  it("starts an email in the state its collection's schedule mode implies", () => {
    expect(emails.submit(review, submission(), "http").state).toBe("pending");
    expect(emails.submit(immediate, submission(), "http").state).toBe("ready");
  });

  it("refuses a submission with neither text nor html", async () => {
    expect(
      await codeOf(() =>
        emails.submit(review, { ...submission(), text: null, html: null }, "http"),
      ),
    ).toBe("no_body");
  });

  it("sends a ready email in the background, with no human action", async () => {
    const email = emails.submit(immediate, submission("automatic"), "http");

    const result = await sender.drainOnce();
    expect(result).toEqual({ attempted: 1, sent: 1 });

    const stored = emails.findById(email.id)!;
    expect(stored.state).toBe("sent");
    // Plain SMTP has no feedback channel, so acceptance is delivery status `sent`.
    expect(stored.deliveryStatus).toBe("sent");
    expect(stored.sentAt).not.toBeNull();
    expect(sink.messages).toHaveLength(1);
    expect(sink.messages[0]!.data).toContain("Subject: automatic");
  });

  it("never sends a pending email - not in the background, not in bulk", async () => {
    const email = emails.submit(review, submission(), "http");

    expect(await sender.drainOnce()).toEqual({ attempted: 0, sent: 0 });

    const [outcome] = await sender.sendExplicit(world.operatorActor, [email.id]);
    expect(outcome).toMatchObject({ ok: false, code: "not_approved" });
    expect(emails.findById(email.id)!.state).toBe("pending");
    expect(sink.messages).toHaveLength(0);
  });

  it("moves pending to ready on approval, and sends it then", async () => {
    const email = emails.submit(review, submission(), "http");

    sender.approveMany(world.operatorActor, [email.id]);
    expect(emails.findById(email.id)!.state).toBe("ready");
    expect(emails.findById(email.id)!.reviewedAt).not.toBeNull();

    const [outcome] = await sender.sendExplicit(world.operatorActor, [email.id]);
    expect(outcome!.ok).toBe(true);
    expect(emails.findById(email.id)!.state).toBe("sent");
  });

  it("stops retrying after three failed attempts, and a human overrides the cap", async () => {
    const email = emails.submit(immediate, submission(), "http");

    sink.failNext(3);
    for (let pass = 0; pass < 3; pass += 1) await sender.drainOnce();

    const held = emails.findById(email.id)!;
    expect(held.state).toBe("ready");
    expect(held.attempts).toBe(3);
    expect(held.lastError).toBeTruthy();

    // The background sender has given up ...
    expect(await sender.drainOnce()).toEqual({ attempted: 0, sent: 0 });

    // ... but pressing Send *is* the intervention the back-off waits for.
    const [outcome] = await sender.sendExplicit(world.operatorActor, [email.id]);
    expect(outcome!.ok).toBe(true);
    expect(emails.findById(email.id)!.state).toBe("sent");
  });

  it("reports one outcome per id and never aborts the batch", async () => {
    const ok = emails.submit(immediate, submission("ok"), "http");
    const pending = emails.submit(review, submission("pending"), "http");

    const outcomes = await sender.sendExplicit(world.operatorActor, [
      ok.id,
      pending.id,
      "does-not-exist",
    ]);

    expect(outcomes.map((outcome) => outcome.ok)).toEqual([true, false, false]);
    expect(outcomes[1]!.code).toBe("not_approved");
    expect(outcomes[2]!.code).toBe("not_found");
  });

  it("cannot send from a collection with no provider", async () => {
    const orphan = makeCollection(world.operatorActor, {
      name: "no provider",
      scheduleMode: "immediate",
    });
    const email = emails.submit(orphan, submission(), "http");

    // The background sender does not pick it up at all ...
    expect(await sender.drainOnce()).toEqual({ attempted: 0, sent: 0 });

    // ... and an explicit send says exactly why.
    const [outcome] = await sender.sendExplicit(world.operatorActor, [email.id]);
    expect(outcome).toMatchObject({ ok: false, code: "no_provider" });
  });

  it("sends a test copy without touching the stored email (§4.4)", async () => {
    const email = emails.submit(review, submission("original"), "http");
    const target = testAddresses.create(world.operatorActor, { address: "me@example.test" });

    // It works even while the email is pending.
    await sender.sendTestCopy(world.operatorActor, email.id, target.id);

    expect(sink.messages).toHaveLength(1);
    expect(sink.messages[0]!.data).toContain("[test] original");
    expect(sink.messages[0]!.to).toEqual(["me@example.test"]);

    const stored = emails.findById(email.id)!;
    expect(stored.state).toBe("pending");
    expect(stored.attempts).toBe(0);
    expect(stored.deliveryStatus).toBe("unknown");
    expect(stored.sentAt).toBeNull();
  });

  it("refuses a test address that is not the acting operator's", async () => {
    const email = emails.submit(review, submission(), "http");
    expect(
      await codeOf(() => sender.sendTestCopy(world.operatorActor, email.id, "someone-elses")),
    ).toBe("not_found");
  });

  it("fails a send loudly when the provider type is not implemented (§2.4)", async () => {
    const unimplemented = providers.create(world.adminOneActor, {
      name: "Hosted",
      type: "sendgrid",
      config: { apiKey: "x" },
    });
    const collection = makeCollection(world.operatorActor, {
      name: "hosted",
      scheduleMode: "immediate",
      providerId: unimplemented.id,
    });
    const email = emails.submit(collection, submission(), "http");

    const [outcome] = await sender.sendExplicit(world.operatorActor, [email.id]);
    expect(outcome!.ok).toBe(false);
    expect(outcome!.error).toMatch(/not implemented/i);
    // Not silently dropped: it is still there, with the reason recorded.
    expect(emails.findById(email.id)!.state).toBe("ready");
    expect(emails.findById(email.id)!.lastError).toMatch(/not implemented/i);
  });
});

describe("delivery tracking (§3.4, §4.3)", () => {
  let world: WorldT;
  let sink: SinkT;

  beforeEach(async () => {
    await resetDatabase();
    sink = await startSmtpSink();
    world = await buildWorld();
    providers.update(world.adminOneActor, world.provider.id, {
      config: { host: "127.0.0.1", port: sink.port, secure: false },
    });
  });

  afterEach(async () => {
    await closeTransports();
    await sink.close();
  });

  it("updates delivery status by email id and by provider message id", async () => {
    const collection = makeCollection(world.operatorActor, {
      name: "B",
      scheduleMode: "immediate",
      providerId: world.provider.id,
    });
    const first = emails.submit(collection, submission("one"), "http");
    const second = emails.submit(collection, submission("two"), "http");
    await sender.drainOnce();

    const sentSecond = emails.findById(second.id)!;

    const matched = emails.applyDeliveryEvents([
      { emailId: first.id, status: "delivered" },
      { providerMessageId: sentSecond.providerMessageId!, status: "bounced" },
      { emailId: "unknown-id", status: "delivered" },
    ]);

    expect(matched).toBe(2);
    expect(emails.findById(first.id)!.deliveryStatus).toBe("delivered");
    expect(emails.findById(second.id)!.deliveryStatus).toBe("bounced");
  });

  it("keeps updating already-sent mail while the owner is suspended (§2.1.5)", async () => {
    const collection = makeCollection(world.operatorActor, {
      name: "B",
      scheduleMode: "immediate",
      providerId: world.provider.id,
    });
    const email = emails.submit(collection, submission(), "http");
    await sender.drainOnce();

    const accounts = await import("@/domain/accounts");
    accounts.setDisabled(world.adminOneActor, world.operator.id, true);

    expect(emails.applyDeliveryEvents([{ emailId: email.id, status: "delivered" }])).toBe(1);
    expect(emails.findById(email.id)!.deliveryStatus).toBe("delivered");
  });

  it("hides one collection's emails from another (§3.3)", () => {
    const mine = makeCollection(world.operatorActor, { name: "mine" });
    const other = makeCollection(world.operatorActor, { name: "other" });
    const email = emails.submit(mine, submission(), "http");

    expect(emails.findForCollection(mine.id, email.id).id).toBe(email.id);
    expect(() => emails.findForCollection(other.id, email.id)).toThrow(/not found/i);
  });

  it("lists emails awaiting review first (§5.4)", () => {
    const collection = makeCollection(world.operatorActor, { name: "mixed" });
    emails.submit(collection, submission("older pending"), "http");
    const ready = emails.submit(collection, submission("newer ready"), "http");
    sender.approveMany(world.operatorActor, [ready.id]);
    emails.submit(collection, submission("newest pending"), "http");

    const page = emails.list(collection.id, { limit: 10, offset: 0 });
    expect(page.emails.slice(0, 2).every(({ state }) => state === "pending")).toBe(true);
    expect(page.emails[2]!.state).toBe("ready");
    expect(page.total).toBe(3);
  });

  it("refuses to delete a provider still assigned to a collection (§2.4)", async () => {
    makeCollection(world.operatorActor, { name: "uses it", providerId: world.provider.id });

    expect(
      await codeOf(() => providers.remove(world.adminOneActor, world.provider.id)),
    ).toBe("provider_in_use");
  });

  it("shows operators a provider's name and type, never its configuration", () => {
    const choices = providers.choicesFor(world.operatorActor);
    expect(choices).toEqual([
      { id: world.provider.id, name: "Relay", type: "smtp" },
    ]);
    expect(Object.keys(choices[0]!)).not.toContain("config");
  });

  it("refuses a provider that belongs to another admin", async () => {
    const theirs = providers.create(world.adminTwoActor, {
      name: "Theirs",
      type: "smtp",
      config: { host: "elsewhere", port: 25 },
    });

    expect(
      await codeOf(() =>
        collections.create(world.operatorActor, {
          name: "x",
          scheduleMode: "immediate",
          providerId: theirs.id,
        }),
      ),
    ).toBe("not_found");
  });
});
