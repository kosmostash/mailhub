import * as accounts from "./accounts";
import * as activity from "./activity";
import * as collections from "./collections";
import { config } from "./config";
import { messageOf, transportFor } from "./delivery";
import * as emails from "./emails";
import { MailhubError, conflict, notFound } from "./errors";
import * as providers from "./providers";
import * as testAddresses from "./testAddresses";
import type { ActorT, CollectionT, EmailT, ProviderT, SendOutcomeT } from "./types";

/**
 * Sending (§4).
 *
 * One delivery path serves all three callers - the background sender, an
 * explicit or bulk send, and a test copy - so an email cannot be delivered one
 * way in the background and another way when a human clicks Send. What differs
 * between them is only *which* emails are eligible and what is recorded
 * afterwards, and that difference lives here rather than in the transports.
 */

type ReadyToSendT = { email: EmailT; collection: CollectionT; provider: ProviderT };

/** Resolve everything a send needs, or say precisely what is missing. */
const prepare = (email: EmailT): ReadyToSendT => {
  const collection = collections.findById(email.collectionId);
  if (!collection) throw notFound("Collection");

  if (!collection.providerId) {
    throw conflict(
      `Collection "${collection.name}" has no provider assigned`,
      "no_provider",
    );
  }

  const provider = providers.findById(collection.providerId);
  if (!provider) throw notFound("Provider");

  return { email, collection, provider };
};

const scopeOfCollection = (collection: CollectionT) => {
  const owner = accounts.findById(collection.operatorId);
  return { adminId: owner?.adminId ?? null, operatorId: collection.operatorId };
};

/**
 * Hand one email to its provider and record the outcome.
 *
 * Success moves `ready -> sent` with the send time and the provider's message
 * id; failure leaves it `ready`, increments the attempt count and keeps the
 * error text where the UI can show it (§4.1).
 */
const deliver = async (
  ready: ReadyToSendT,
  actor: ActorT | "sender",
): Promise<SendOutcomeT> => {
  const { email, collection, provider } = ready;

  try {
    const result = await transportFor(provider).send(messageOf(email));
    emails.markSent(email.id, result.messageId);

    activity.record({
      action: actor === "sender" ? "email.send_background" : "email.send",
      objectType: "email",
      objectId: email.id,
      objectLabel: email.subject,
      actor,
      scope: scopeOfCollection(collection),
      detail: { collectionId: collection.id, provider: provider.name },
    });

    return {
      id: email.id,
      ok: true,
      ...(result.messageId ? { providerMessageId: result.messageId } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emails.markFailed(email.id, message);

    activity.record({
      action: "email.send_failed",
      objectType: "email",
      objectId: email.id,
      objectLabel: email.subject,
      actor,
      scope: scopeOfCollection(collection),
      detail: { collectionId: collection.id, provider: provider.name, error: message },
    });

    return { id: email.id, ok: false, error: message, code: "provider_error" };
  }
};

/**
 * One pass of the background sender (§4.1).
 *
 * Emails are taken oldest first in a bounded batch. After
 * `MAILHUB_SENDER_MAX_ATTEMPTS` failures an email stops being picked up and
 * waits, visible with its error, for a human - who overrides the cap simply by
 * pressing Send (§4.2).
 */
export const drainOnce = async (): Promise<{ attempted: number; sent: number }> => {
  const batch = emails.claimSendable(config.sender.batchSize, config.sender.maxAttempts);

  let sent = 0;
  for (const email of batch) {
    // Re-read: a batch can outlive the state it was selected under - an
    // operator may have deleted the collection or cleared its provider while
    // we were working through the queue.
    const current = emails.findById(email.id);
    if (!current || current.state !== "ready") continue;

    try {
      const outcome = await deliver(prepare(current), "sender");
      if (outcome.ok) sent += 1;
    } catch (error) {
      // A missing provider is not a delivery attempt: record it and move on
      // without burning one of the email's three tries.
      emails.markFailed(
        current.id,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return { attempted: batch.length, sent };
};

/**
 * An explicit send, single or bulk (§4.2).
 *
 * The attempt cap is ignored - a human pressing Send *is* the intervention the
 * back-off waits for - and every id reports its own outcome, so one bad id
 * never aborts the rest of the batch.
 */
export const sendExplicit = async (
  actor: ActorT,
  ids: Array<string>,
): Promise<Array<SendOutcomeT>> => {
  const outcomes: Array<SendOutcomeT> = [];

  for (const id of ids) {
    const email = emails.visible(actor, id);

    if (!email) {
      outcomes.push({ id, ok: false, error: "Unknown email", code: "not_found" });
      continue;
    }

    if (email.state !== "ready") {
      outcomes.push({
        id,
        ok: false,
        code: email.state === "pending" ? "not_approved" : "already_sent",
        error:
          email.state === "pending"
            ? "Still awaiting review"
            : "Already sent",
      });
      continue;
    }

    try {
      outcomes.push(await deliver(prepare(email), actor));
    } catch (error) {
      const failure =
        error instanceof MailhubError
          ? { error: error.message, code: error.code }
          : { error: error instanceof Error ? error.message : String(error), code: "error" };
      outcomes.push({ id, ok: false, ...failure });
    }
  }

  return outcomes;
};

/** Approve a batch, reporting one outcome per id like an explicit send does. */
export const approveMany = (actor: ActorT, ids: Array<string>): Array<SendOutcomeT> =>
  ids.map((id) => {
    const email = emails.visible(actor, id);
    if (!email) return { id, ok: false, error: "Unknown email", code: "not_found" };
    if (email.state !== "pending") {
      return { id, ok: false, error: "Not awaiting review", code: "not_pending" };
    }
    emails.approve(actor, email);
    return { id, ok: true };
  });

/**
 * Send to me (§4.4).
 *
 * A *copy* goes to one of the operator's own test addresses, marked `[test]`.
 * The stored email is untouched - no state change, no attempt count, no
 * delivery tracking - which is what lets this work in every lifecycle state,
 * `pending` and `sent` included.
 */
export const sendTestCopy = async (
  actor: ActorT,
  emailId: string,
  testAddressId: string,
): Promise<{ address: string }> => {
  const email = emails.mustSee(actor, emailId);
  const { collection, provider } = prepare(email);

  const target = testAddresses
    .listFor(actor.identity.id)
    .find((entry) => entry.id === testAddressId);
  if (!target) throw notFound("Test address");

  await transportFor(provider).send({
    ...messageOf(email),
    to: [{ address: target.address }],
    // A test copy goes only where it was asked to go.
    cc: [],
    bcc: [],
    subject: `[test] ${email.subject}`,
  });

  activity.record({
    action: "email.test_send",
    objectType: "email",
    objectId: email.id,
    objectLabel: email.subject,
    actor,
    scope: scopeOfCollection(collection),
    detail: { to: target.address, provider: provider.name },
  });

  return { address: target.address };
};
