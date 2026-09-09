import { closeDb, db } from "@/db";
import * as accounts from "@/domain/accounts";
import * as collections from "@/domain/collections";
import { closeTransports } from "@/domain/delivery";
import * as providers from "@/domain/providers";
import * as sessions from "@/domain/sessions";
import type { ActorT, CollectionT, ProviderT, UserT } from "@/domain/types";

/**
 * Test scaffolding.
 *
 * The suites below exercise the domain the way the routes do - through an
 * `ActorT` - rather than reaching into the database, so a rule that holds here
 * holds for every caller: HTTP, SMTP or worker.
 */

export const resetDatabase = async (): Promise<void> => {
  await closeTransports();
  closeDb();
  db(); // re-opens `:memory:` and runs the migrations from scratch
};

/** An actor for a user, as sign-in would produce. */
export const actorFor = (user: UserT): ActorT => {
  const token = sessions.signInDirect(user);
  const actor = sessions.resolve(token);
  if (!actor) throw new Error(`could not resolve a session for ${user.email}`);
  return actor;
};

/** An actor for `account` acting as `target` - what impersonation produces. */
export const impersonatingActor = (account: UserT, target: UserT): ActorT => {
  const token = sessions.signInDirect(account);
  const actor = sessions.resolve(token)!;
  sessions.start(actor, target.id);
  return sessions.resolve(token)!;
};

export const password = "correct-horse-battery";

/**
 * The tree the conformance walk-through uses: a superadmin, two admins that
 * must never see each other, one operator under admin one, and that operator's
 * SMTP provider.
 */
export type WorldT = {
  superadmin: UserT;
  superadminActor: ActorT;
  adminOne: UserT;
  adminOneActor: ActorT;
  adminTwo: UserT;
  adminTwoActor: ActorT;
  operator: UserT;
  operatorActor: ActorT;
  provider: ProviderT;
};

export const buildWorld = async (): Promise<WorldT> => {
  const superadmin = await accounts.createSuperadmin({
    email: "root@mailhub.test",
    password,
  });
  const superadminActor = actorFor(superadmin);

  const adminOne = await accounts.createAdmin(superadminActor, {
    email: "one@mailhub.test",
    password,
  });
  const adminTwo = await accounts.createAdmin(superadminActor, {
    email: "two@mailhub.test",
    password,
  });

  const adminOneActor = actorFor(adminOne);
  const adminTwoActor = actorFor(adminTwo);

  const operator = await accounts.createOperator(adminOneActor, {
    email: "o1@mailhub.test",
    password,
  });

  const provider = providers.create(adminOneActor, {
    name: "Relay",
    type: "smtp",
    config: { host: "127.0.0.1", port: 2500, secure: false },
  });

  return {
    superadmin,
    superadminActor,
    adminOne,
    adminOneActor,
    adminTwo,
    adminTwoActor,
    operator,
    operatorActor: actorFor(operator),
    provider,
  };
};

export const makeCollection = (
  actor: ActorT,
  input: { name: string; scheduleMode?: "after_review" | "immediate"; providerId?: string | null },
): CollectionT =>
  collections.create(actor, {
    name: input.name,
    scheduleMode: input.scheduleMode ?? "after_review",
    providerId: input.providerId ?? null,
  });

/** A minimal valid submission payload. */
export const submission = (subject = "Hello") => ({
  from: { address: "app@example.test", name: "App" },
  to: [{ address: "user@example.test" }],
  subject,
  text: "Body",
});
