import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as accounts from "@/domain/accounts";
import * as activity from "@/domain/activity";
import { closeTransports } from "@/domain/delivery";
import * as emails from "@/domain/emails";
import * as providers from "@/domain/providers";
import * as sender from "@/domain/sender";

import {
  buildWorld,
  impersonatingActor,
  makeCollection,
  password,
  resetDatabase,
  submission,
  type WorldT,
} from "./helpers";
import { type SinkT, startSmtpSink } from "./smtpSink";

const page = (query: Partial<Parameters<typeof activity.list>[0]> = {}) =>
  activity.list({ limit: 100, offset: 0, ...query });

describe("the activity trail (§2.6)", () => {
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

  it("marks an action performed via impersonation, attributed to the assumed identity", () => {
    const acting = impersonatingActor(world.adminOne, world.operator);
    makeCollection(acting, { name: "made while impersonating" });

    const entry = page().entries.find(({ action }) => action === "collection.create")!;

    // Attributed to the operator ...
    expect(entry.actorId).toBe(world.operator.id);
    expect(entry.actorRole).toBe("operator");
    // ... and marked as performed by the admin standing in their shoes.
    expect(entry.impersonatorId).toBe(world.adminOne.id);
    expect(entry.impersonatorEmail).toBe(world.adminOne.email);
  });

  it("leaves the marker empty for an action taken in one's own identity", () => {
    makeCollection(world.operatorActor, { name: "mine" });
    const entry = page().entries.find(({ action }) => action === "collection.create")!;
    expect(entry.impersonatorId).toBeNull();
  });

  it("shows an admin their operators' actions, and nothing of another admin's tree", async () => {
    const theirOperator = await accounts.createOperator(world.adminTwoActor, {
      email: "o2@mailhub.test",
      password,
    });
    makeCollection(world.operatorActor, { name: "ours" });
    const otherActor = (await import("./helpers")).actorFor(theirOperator);
    makeCollection(otherActor, { name: "theirs" });

    const mine = page({ adminId: world.adminOne.id }).entries;
    const theirs = page({ adminId: world.adminTwo.id }).entries;

    expect(mine.some(({ objectLabel }) => objectLabel === "ours")).toBe(true);
    expect(mine.some(({ objectLabel }) => objectLabel === "theirs")).toBe(false);
    expect(theirs.some(({ objectLabel }) => objectLabel === "theirs")).toBe(true);

    // The superadmin sees across both.
    const everything = page().entries;
    expect(everything.some(({ objectLabel }) => objectLabel === "ours")).toBe(true);
    expect(everything.some(({ objectLabel }) => objectLabel === "theirs")).toBe(true);
  });

  it("records admin management as superadmin-only", () => {
    const adminScoped = page({ adminId: world.adminOne.id }).entries;
    expect(adminScoped.some(({ action }) => action === "admin.create")).toBe(false);
    expect(page().entries.some(({ action }) => action === "admin.create")).toBe(true);
  });

  it("names the background sender as the actor when it sends", async () => {
    const collection = makeCollection(world.operatorActor, {
      name: "B",
      scheduleMode: "immediate",
      providerId: world.provider.id,
    });
    emails.submit(collection, submission(), "http");
    await sender.drainOnce();

    const entry = page().entries.find(({ action }) => action === "email.send_background")!;
    expect(entry.actorKind).toBe("sender");
    expect(entry.actorId).toBeNull();
    // It still lands in the owning operator's and admin's trails.
    expect(page({ operatorId: world.operator.id }).entries.map((e) => e.action)).toContain(
      "email.send_background",
    );
  });

  it("is history, not property: reassignment never rewrites past entries", async () => {
    makeCollection(world.operatorActor, { name: "A" });
    const operatorTwo = await accounts.createOperator(world.adminOneActor, {
      email: "o2@mailhub.test",
      password,
    });

    accounts.setDisabled(world.adminOneActor, world.operator.id, true);
    accounts.reassign(world.adminOneActor, world.operator.id, operatorTwo.id);

    const created = page().entries.find(
      ({ action, objectLabel }) => action === "collection.create" && objectLabel === "A",
    )!;

    // The entry still names the account that acted, not the one that now owns
    // the collection.
    expect(created.actorId).toBe(world.operator.id);
    expect(page({ operatorId: operatorTwo.id }).entries.map((e) => e.action)).not.toContain(
      "collection.create",
    );
  });

  it("survives the deletion of the account it names", async () => {
    accounts.setDisabled(world.adminOneActor, world.operator.id, true);
    accounts.remove(world.adminOneActor, world.operator.id);

    const entries = page().entries.filter(({ objectId }) => objectId === world.operator.id);
    expect(entries.some(({ action }) => action === "operator.create")).toBe(true);
    expect(entries.some(({ action }) => action === "operator.delete")).toBe(true);
  });

  it("records provider management against the owning admin", () => {
    providers.create(world.adminOneActor, {
      name: "Second",
      type: "smtp",
      config: { host: "h.test", port: 25 },
    });

    const entry = page({ adminId: world.adminOne.id }).entries.find(
      ({ action, objectLabel }) => action === "provider.create" && objectLabel === "Second",
    );
    expect(entry).toBeDefined();
    expect(page({ adminId: world.adminTwo.id }).entries).not.toContainEqual(entry);
  });
});
