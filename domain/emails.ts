import { db } from "@/db";
import { type EmailRow, toEmail } from "@/db/rows";

import * as accounts from "./accounts";
import * as activity from "./activity";
import { now } from "./clock";
import { invalid, notFound } from "./errors";
import { newId } from "./ids";
import type {
  ActorT,
  AddressT,
  CollectionT,
  DeliveryStatusT,
  EmailSourceT,
  EmailStateT,
  EmailT,
} from "./types";

/**
 * Stored emails and their lifecycle (§2.7).
 *
 * `pending -> ready -> sent` and nothing else: a sent email never goes back,
 * and a pending email is never sent - not by the background sender, not by a
 * bulk action. Every transition in this module is expressed as a conditional
 * UPDATE, so the guarantee holds under concurrency rather than only in the
 * happy path.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SubmissionT = {
  from: AddressT;
  to: Array<AddressT>;
  cc?: Array<AddressT>;
  bcc?: Array<AddressT>;
  subject: string;
  text?: string | null;
  html?: string | null;
};

const cleanAddress = (value: AddressT, field: string): AddressT => {
  const address = String(value?.address ?? "").trim();
  if (!EMAIL_PATTERN.test(address)) {
    throw invalid(`${field}: ${address || "(empty)"} is not a valid email address`, "invalid_address");
  }
  const name = typeof value.name === "string" ? value.name.trim() : "";
  return name ? { address, name } : { address };
};

const cleanList = (list: Array<AddressT> | undefined, field: string): Array<AddressT> =>
  (list ?? []).map((entry) => cleanAddress(entry, field));

/**
 * Validate a submission from either door - HTTP or SMTP - so the two cannot
 * drift. Route-level schemas catch shape; this catches meaning.
 */
export const normalizeSubmission = (input: SubmissionT): Required<SubmissionT> => {
  const to = cleanList(input.to, "to");
  if (!to.length) throw invalid("At least one recipient is required", "no_recipients");

  const text = input.text?.trim() ? input.text : null;
  const html = input.html?.trim() ? input.html : null;
  if (!text && !html) {
    throw invalid("An email needs a text body, an html body, or both", "no_body");
  }

  return {
    from: cleanAddress(input.from, "from"),
    to,
    cc: cleanList(input.cc, "cc"),
    bcc: cleanList(input.bcc, "bcc"),
    subject: (input.subject ?? "").trim(),
    text,
    html,
  };
};

/**
 * Store a submitted email (§3.2, §3.6).
 *
 * Storing is all that happens: the response never waits for a send, and the
 * initial state comes from the collection's schedule mode - `after_review`
 * starts `pending`, `immediate` starts `ready`.
 */
export const submit = (
  collection: CollectionT,
  input: SubmissionT,
  source: EmailSourceT,
): EmailT => {
  const payload = normalizeSubmission(input);
  const timestamp = now();
  const state: EmailStateT = collection.scheduleMode === "immediate" ? "ready" : "pending";

  const email: EmailT = {
    id: newId(),
    collectionId: collection.id,
    from: payload.from,
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    state,
    deliveryStatus: "unknown",
    attempts: 0,
    lastError: null,
    providerMessageId: null,
    source,
    createdAt: timestamp,
    // An `immediate` email is cleared for sending the moment it arrives, so it
    // is reviewed by the schedule mode rather than by a person.
    reviewedAt: state === "ready" ? timestamp : null,
    sentAt: null,
  };

  db()
    .prepare(
      `INSERT INTO emails (
         id, collection_id, from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
         subject, text_body, html_body, state, delivery_status, attempts, source,
         created_at, reviewed_at
       ) VALUES (
         @id, @collectionId, @fromAddress, @fromName, @to, @cc, @bcc,
         @subject, @text, @html, @state, 'unknown', 0, @source,
         @createdAt, @reviewedAt
       )`,
    )
    .run({
      id: email.id,
      collectionId: email.collectionId,
      fromAddress: email.from.address,
      fromName: email.from.name ?? null,
      to: JSON.stringify(email.to),
      cc: JSON.stringify(email.cc),
      bcc: JSON.stringify(email.bcc),
      subject: email.subject,
      text: email.text,
      html: email.html,
      state: email.state,
      source: email.source,
      createdAt: email.createdAt,
      reviewedAt: email.reviewedAt,
    });

  return email;
};

export const findById = (id: string): EmailT | undefined => {
  const row = db().prepare<[string], EmailRow>("SELECT * FROM emails WHERE id = ?").get(id);
  return row && toEmail(row);
};

/**
 * Poll an email as its submitting project (§3.3). An id belonging to another
 * collection reads exactly like one that does not exist, so collections cannot
 * observe each other.
 */
export const findForCollection = (collectionId: string, id: string): EmailT => {
  const email = findById(id);
  if (!email || email.collectionId !== collectionId) throw notFound("Email");
  return email;
};

/** The email as `actor` may see it, or `undefined` when out of scope (§6). */
export const visible = (actor: ActorT, emailId: string): EmailT | undefined => {
  const email = findById(emailId);
  if (!email) return undefined;

  const collection = db()
    .prepare<[string], { operator_id: string }>(
      "SELECT operator_id FROM collections WHERE id = ?",
    )
    .get(email.collectionId);
  if (!collection) return undefined;

  const { identity } = actor;
  if (identity.role === "superadmin") return email;
  if (identity.role === "operator") {
    return collection.operator_id === identity.id ? email : undefined;
  }

  const owner = accounts.findById(collection.operator_id);
  return owner?.adminId === identity.id ? email : undefined;
};

export const mustSee = (actor: ActorT, emailId: string): EmailT => {
  const email = visible(actor, emailId);
  if (!email) throw notFound("Email");
  return email;
};

export type EmailFilterT = {
  state?: EmailStateT | undefined;
  deliveryStatus?: DeliveryStatusT | undefined;
  limit: number;
  offset: number;
};

export type EmailPageT = { emails: Array<EmailT>; total: number };

/**
 * One collection's emails (§5.4).
 *
 * Ordering is part of the contract, not a preference: emails awaiting review
 * come first, so review work is impossible to miss.
 */
export const list = (collectionId: string, filter: EmailFilterT): EmailPageT => {
  const where = ["collection_id = @collectionId"];
  const params: Record<string, unknown> = { collectionId };

  if (filter.state) {
    where.push("state = @state");
    params.state = filter.state;
  }
  if (filter.deliveryStatus) {
    where.push("delivery_status = @deliveryStatus");
    params.deliveryStatus = filter.deliveryStatus;
  }

  const clause = `WHERE ${where.join(" AND ")}`;

  const { total } = db()
    .prepare<Record<string, unknown>, { total: number }>(
      `SELECT COUNT(*) AS total FROM emails ${clause}`,
    )
    .get(params)!;

  const rows = db()
    .prepare<Record<string, unknown>, EmailRow>(
      `SELECT * FROM emails ${clause}
        ORDER BY CASE state WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
        LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: filter.limit, offset: filter.offset });

  return { emails: rows.map(toEmail), total };
};

/**
 * Approve a pending email (§2.7). The UPDATE carries the state it expects, so
 * approving twice is a no-op rather than a second transition.
 */
export const approve = (actor: ActorT, email: EmailT): boolean => {
  const timestamp = now();
  const { changes } = db()
    .prepare("UPDATE emails SET state = 'ready', reviewed_at = ? WHERE id = ? AND state = 'pending'")
    .run(timestamp, email.id);

  if (!changes) return false;

  activity.record({
    action: "email.approve",
    objectType: "email",
    objectId: email.id,
    objectLabel: email.subject,
    actor,
    detail: { collectionId: email.collectionId },
  });

  return true;
};

/** A successful hand-off: `ready -> sent`, with the provider's message id (§4.1). */
export const markSent = (emailId: string, providerMessageId: string | null): void => {
  db()
    .prepare(
      `UPDATE emails
          SET state = 'sent',
              sent_at = ?,
              attempts = attempts + 1,
              last_error = NULL,
              provider_message_id = ?,
              delivery_status = CASE WHEN delivery_status = 'unknown' THEN 'sent' ELSE delivery_status END
        WHERE id = ? AND state = 'ready'`,
    )
    .run(now(), providerMessageId, emailId);
};

/** A failed hand-off: still `ready`, one more attempt, the error kept (§4.1). */
export const markFailed = (emailId: string, error: string): void => {
  db()
    .prepare("UPDATE emails SET attempts = attempts + 1, last_error = ? WHERE id = ?")
    .run(error.slice(0, 2000), emailId);
};

/**
 * Record why an email could not even be attempted - no provider, a collection
 * pulled out from under it - without spending one of its three attempts. The
 * attempt cap is for a provider that keeps refusing, not for a configuration
 * that is not there yet.
 */
export const markError = (emailId: string, error: string): void => {
  db()
    .prepare("UPDATE emails SET last_error = ? WHERE id = ?")
    .run(error.slice(0, 2000), emailId);
};

/**
 * The background sender's batch (§4.1): `ready` emails whose collection has a
 * provider, oldest first, skipping anything in a suspended subtree and
 * anything that has exhausted its attempts.
 */
export const claimSendable = (limit: number, maxAttempts: number): Array<EmailT> =>
  db()
    .prepare<[number, number], EmailRow>(
      `SELECT e.* FROM emails e
         JOIN collections c ON c.id = e.collection_id
         JOIN users o ON o.id = c.operator_id
         LEFT JOIN users a ON a.id = o.admin_id
        WHERE e.state = 'ready'
          AND c.provider_id IS NOT NULL
          AND e.attempts < ?
          AND o.disabled_at IS NULL
          AND (a.id IS NULL OR a.disabled_at IS NULL)
        ORDER BY e.created_at ASC
        LIMIT ?`,
    )
    .all(maxAttempts, limit)
    .map(toEmail);

/** One normalized delivery event (§3.4). */
export type DeliveryEventT = {
  emailId?: string | undefined;
  providerMessageId?: string | undefined;
  status: DeliveryStatusT;
};

/**
 * Apply delivery events, correlating on our id or the provider's (§4.3).
 *
 * Events for unknown messages are counted as unmatched and otherwise ignored -
 * the webhook never errors on an id it does not recognise. Events keep landing
 * for already-sent mail even while the owning account is suspended, so history
 * stays truthful (§2.1.5).
 */
export const applyDeliveryEvents = (events: Array<DeliveryEventT>): number => {
  const byId = db().prepare(
    "UPDATE emails SET delivery_status = ? WHERE id = ? AND state = 'sent'",
  );
  const byMessageId = db().prepare(
    "UPDATE emails SET delivery_status = ? WHERE provider_message_id = ? AND state = 'sent'",
  );

  let matched = 0;
  for (const event of events) {
    if (event.status === "unknown") continue;
    const changes = event.emailId
      ? byId.run(event.status, event.emailId).changes
      : event.providerMessageId
        ? byMessageId.run(event.status, event.providerMessageId).changes
        : 0;
    if (changes > 0) matched += 1;
  }

  return matched;
};
