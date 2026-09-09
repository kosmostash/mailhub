import { beforeEach, describe, expect, it } from "vitest";

import * as accounts from "@/domain/accounts";
import * as collections from "@/domain/collections";
import * as emails from "@/domain/emails";
import { MailhubError } from "@/domain/errors";
import * as providers from "@/domain/providers";
import * as sessions from "@/domain/sessions";

import {
  actorFor,
  buildWorld,
  impersonatingActor,
  makeCollection,
  password,
  resetDatabase,
  submission,
  type WorldT,
} from "./helpers";

/** The error code a call fails with, or `null` if it did not fail. */
const codeOf = async (fn: () => unknown): Promise<string | null> => {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof MailhubError ? error.code : `unexpected: ${String(error)}`;
  }
};

describe("roles and the hierarchy (§2.1)", () => {
  let world: WorldT;

  beforeEach(async () => {
    await resetDatabase();
    world = await buildWorld();
  });

  it("allows exactly one superadmin, ever", async () => {
    expect(accounts.superadminExists()).toBe(true);
    expect(
      await codeOf(() =>
        accounts.createSuperadmin({ email: "second@mailhub.test", password }),
      ),
    ).toBe("superadmin_exists");
  });

  it("keeps email addresses unique across all three roles", async () => {
    expect(
      await codeOf(() =>
        accounts.createAdmin(world.superadminActor, {
          email: world.operator.email,
          password,
        }),
      ),
    ).toBe("email_taken");
  });

  it("gives an admin no CRUD outside providers, in their own identity", async () => {
    expect(
      await codeOf(() => makeCollection(world.adminOneActor, { name: "nope" })),
    ).toBe("wrong_role");

    // ... but providers are theirs to manage.
    expect(providers.listForAdmin(world.adminOne.id)).toHaveLength(1);
  });

  it("gives the superadmin no CRUD of its own, one level up", async () => {
    expect(
      await codeOf(() => makeCollection(world.superadminActor, { name: "nope" })),
    ).toBe("wrong_role");
    expect(
      await codeOf(() =>
        providers.create(world.superadminActor, {
          name: "x",
          type: "smtp",
          config: { host: "h", port: 25 },
        }),
      ),
    ).toBe("wrong_role");
  });

  it("keeps admins mutually invisible", async () => {
    const operatorTwo = await accounts.createOperator(world.adminTwoActor, {
      email: "o2@mailhub.test",
      password,
    });
    const collection = makeCollection(actorFor(operatorTwo), { name: "theirs" });

    // Admin one sees nothing of admin two's tree ...
    expect(collections.visible(world.adminOneActor, collection.id)).toBeUndefined();
    expect(accounts.visibleOperator(world.adminOneActor, operatorTwo.id)).toBeUndefined();

    // ... while the superadmin sees across both.
    expect(collections.visible(world.superadminActor, collection.id)).toBeDefined();
    expect(accounts.visibleOperators(world.superadminActor)).toHaveLength(2);
  });

  it("scopes an operator to their own objects", async () => {
    const sibling = await accounts.createOperator(world.adminOneActor, {
      email: "sibling@mailhub.test",
      password,
    });
    const theirs = makeCollection(actorFor(sibling), { name: "sibling collection" });

    expect(collections.visible(world.operatorActor, theirs.id)).toBeUndefined();
    expect(
      await codeOf(() => collections.update(world.operatorActor, theirs.id, { name: "mine" })),
    ).toBe("not_found");
  });
});

describe("disabling (§2.1.5)", () => {
  let world: WorldT;

  beforeEach(async () => {
    await resetDatabase();
    world = await buildWorld();
  });

  it("revokes the operator's sessions and stops submissions", async () => {
    const collection = makeCollection(world.operatorActor, {
      name: "A",
      providerId: world.provider.id,
    });
    const token = await sessions.signIn(world.operator.email, password);
    expect(sessions.resolve(token)).toBeDefined();

    accounts.setDisabled(world.adminOneActor, world.operator.id, true);

    expect(sessions.resolve(token)).toBeUndefined();
    expect(await codeOf(() => sessions.signIn(world.operator.email, password))).toBe(
      "account_disabled",
    );
    expect(await codeOf(() => collections.authorizeSubmission(collection.id))).toBe(
      "collection_suspended",
    );
  });

  it("distinguishes an unknown collection from a suspended one", async () => {
    expect(await codeOf(() => collections.authorizeSubmission("col_nope"))).toBe(
      "unknown_collection",
    );
  });

  it("covers the whole subtree when an admin is disabled", async () => {
    const collection = makeCollection(world.operatorActor, {
      name: "A",
      providerId: world.provider.id,
    });
    const operatorToken = await sessions.signIn(world.operator.email, password);

    accounts.setDisabled(world.superadminActor, world.adminOne.id, true);

    expect(sessions.resolve(operatorToken)).toBeUndefined();
    expect(await codeOf(() => sessions.signIn(world.operator.email, password))).toBe(
      "account_disabled",
    );
    expect(await codeOf(() => collections.authorizeSubmission(collection.id))).toBe(
      "collection_suspended",
    );

    // ... and lifts entirely on re-enable.
    accounts.setDisabled(world.superadminActor, world.adminOne.id, false);
    expect(await sessions.signIn(world.operator.email, password)).toBeTruthy();
    expect(collections.authorizeSubmission(collection.id).collection.id).toBe(collection.id);
  });

  it("does not stack: an individually disabled operator stays disabled", async () => {
    accounts.setDisabled(world.adminOneActor, world.operator.id, true);
    accounts.setDisabled(world.superadminActor, world.adminOne.id, true);
    accounts.setDisabled(world.superadminActor, world.adminOne.id, false);

    expect(accounts.isSuspended(accounts.mustFind(world.operator.id))).toBe(true);

    accounts.setDisabled(world.adminOneActor, world.operator.id, false);
    expect(accounts.isSuspended(accounts.mustFind(world.operator.id))).toBe(false);
  });

  it("holds back the background sender while suspended", async () => {
    const collection = makeCollection(world.operatorActor, {
      name: "B",
      scheduleMode: "immediate",
      providerId: world.provider.id,
    });
    emails.submit(collection, submission(), "http");

    expect(emails.claimSendable(10, 3)).toHaveLength(1);
    accounts.setDisabled(world.adminOneActor, world.operator.id, true);
    expect(emails.claimSendable(10, 3)).toHaveLength(0);
    accounts.setDisabled(world.adminOneActor, world.operator.id, false);
    expect(emails.claimSendable(10, 3)).toHaveLength(1);
  });
});

describe("reassignment and deletion (§2.1.6)", () => {
  let world: WorldT;

  beforeEach(async () => {
    await resetDatabase();
    world = await buildWorld();
  });

  it("refuses to delete an account that still holds objects", async () => {
    makeCollection(world.operatorActor, { name: "A" });

    expect(await codeOf(() => accounts.remove(world.adminOneActor, world.operator.id))).toBe(
      "not_disabled",
    );

    accounts.setDisabled(world.adminOneActor, world.operator.id, true);
    expect(await codeOf(() => accounts.remove(world.adminOneActor, world.operator.id))).toBe(
      "account_not_empty",
    );
  });

  it("moves a disabled operator's collections, keeping their ids", async () => {
    const collection = makeCollection(world.operatorActor, {
      name: "A",
      providerId: world.provider.id,
    });
    const operatorTwo = await accounts.createOperator(world.adminOneActor, {
      email: "o2@mailhub.test",
      password,
    });

    // Reassignment is the way out of a suspension, not a transfer between
    // working accounts.
    expect(
      await codeOf(() =>
        accounts.reassign(world.adminOneActor, world.operator.id, operatorTwo.id),
      ),
    ).toBe("source_not_disabled");

    accounts.setDisabled(world.adminOneActor, world.operator.id, true);
    accounts.reassign(world.adminOneActor, world.operator.id, operatorTwo.id);

    const moved = collections.findById(collection.id);
    expect(moved?.id).toBe(collection.id);
    expect(moved?.operatorId).toBe(operatorTwo.id);
    expect(moved?.providerId).toBe(world.provider.id);

    // The collection id is the API key, so client projects keep working.
    expect(collections.authorizeSubmission(collection.id).operator.id).toBe(operatorTwo.id);

    // ... and the emptied account is now deletable.
    accounts.remove(world.adminOneActor, world.operator.id);
    expect(accounts.findById(world.operator.id)).toBeUndefined();
  });

  it("moves an admin's operators and providers together", async () => {
    const collection = makeCollection(world.operatorActor, {
      name: "A",
      providerId: world.provider.id,
    });

    accounts.setDisabled(world.superadminActor, world.adminOne.id, true);
    accounts.reassign(world.superadminActor, world.adminOne.id, world.adminTwo.id);

    // The operator and the provider land under the same new admin, so the
    // "a collection's provider belongs to its admin" invariant survives.
    expect(accounts.mustFind(world.operator.id).adminId).toBe(world.adminTwo.id);
    expect(providers.findById(world.provider.id)?.adminId).toBe(world.adminTwo.id);
    expect(collections.findById(collection.id)?.providerId).toBe(world.provider.id);

    accounts.remove(world.superadminActor, world.adminOne.id);
    expect(accounts.findById(world.adminOne.id)).toBeUndefined();
  });

  it("resolves provider name collisions instead of merging them", async () => {
    providers.create(world.adminTwoActor, {
      name: "Relay",
      type: "smtp",
      config: { host: "elsewhere", port: 25 },
    });

    accounts.setDisabled(world.superadminActor, world.adminOne.id, true);
    accounts.reassign(world.superadminActor, world.adminOne.id, world.adminTwo.id);

    const names = providers.listForAdmin(world.adminTwo.id).map(({ name }) => name);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });

  it("leaves personal belongings and the trail behind", async () => {
    // Covered in detail in trail.test.ts; here only the shape of the rule:
    // reassignment moves objects, never an account's own data.
    accounts.setDisabled(world.adminOneActor, world.operator.id, true);
    const operatorTwo = await accounts.createOperator(world.adminOneActor, {
      email: "o2@mailhub.test",
      password,
    });
    accounts.reassign(world.adminOneActor, world.operator.id, operatorTwo.id);
    expect(accounts.mustFind(world.operator.id).disabledAt).not.toBeNull();
  });
});

describe("impersonation (§2.2)", () => {
  let world: WorldT;

  beforeEach(async () => {
    await resetDatabase();
    world = await buildWorld();
  });

  it("lets an admin act as their own operator, and nobody else's", async () => {
    const acting = impersonatingActor(world.adminOne, world.operator);
    expect(acting.impersonating).toBe(true);
    expect(acting.identity.id).toBe(world.operator.id);

    // With the operator's capabilities, not the admin's.
    const collection = makeCollection(acting, { name: "made while impersonating" });
    expect(collections.findById(collection.id)?.operatorId).toBe(world.operator.id);

    expect(sessions.mayImpersonate(world.adminTwo, world.operator)).toBe(false);
    expect(sessions.mayImpersonate(world.adminOne, world.adminTwo)).toBe(false);
    expect(sessions.mayImpersonate(world.adminOne, world.superadmin)).toBe(false);
  });

  it("lets the superadmin assume any admin or operator", () => {
    expect(sessions.mayImpersonate(world.superadmin, world.adminOne)).toBe(true);
    expect(sessions.mayImpersonate(world.superadmin, world.operator)).toBe(true);
    expect(sessions.impersonationTargets(world.superadmin)).toHaveLength(3);
  });

  it("does not nest", async () => {
    const acting = impersonatingActor(world.superadmin, world.adminOne);
    expect(await codeOf(() => sessions.start(acting, world.operator.id))).toBe(
      "already_impersonating",
    );
  });

  it("ends in one step, back to one's own identity", () => {
    const token = sessions.signInDirect(world.adminOne);
    const actor = sessions.resolve(token)!;
    sessions.start(actor, world.operator.id);

    expect(sessions.resolve(token)?.identity.id).toBe(world.operator.id);
    sessions.end(sessions.resolve(token)!);
    const back = sessions.resolve(token)!;
    expect(back.impersonating).toBe(false);
    expect(back.identity.id).toBe(world.adminOne.id);
  });
});
