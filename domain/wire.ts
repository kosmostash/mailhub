import type { EmailT } from "./types";

/**
 * The JSON shapes MailHub puts on the wire.
 *
 * These are deliberately separate from the domain records in `types.ts`: a
 * stored email is free to change shape, an API contract is not. They live at
 * the project root because more than one source folder answers with them - the
 * submission API when a client project polls, and the hub when it renders the
 * email view.
 *
 * KosmoJS derives runtime validators, the typed fetch clients and the OpenAPI
 * schemas from these declarations, so the refinements here are the actual
 * request validation, not documentation of it.
 */

/** An email address with an optional display name (§2.7). */
export type AddressViewT = {
  address: VRefine<string, { format: "email" }>;
  name?: VRefine<string, { maxLength: 200 }>;
};

/** A stored email, as any client sees it. */
export type EmailViewT = {
  id: string;
  collectionId: string;
  from: AddressViewT;
  to: Array<AddressViewT>;
  cc: Array<AddressViewT>;
  bcc: Array<AddressViewT>;
  subject: string;
  text: string | null;
  html: string | null;
  state: "pending" | "ready" | "sent";
  deliveryStatus: "unknown" | "sent" | "delivered" | "bounced";
  attempts: number;
  lastError: string | null;
  providerMessageId: string | null;
  source: "http" | "smtp";
  createdAt: string;
  reviewedAt: string | null;
  sentAt: string | null;
};

export const emailView = (email: EmailT): EmailViewT => ({
  id: email.id,
  collectionId: email.collectionId,
  from: email.from,
  to: email.to,
  cc: email.cc,
  bcc: email.bcc,
  subject: email.subject,
  text: email.text,
  html: email.html,
  state: email.state,
  deliveryStatus: email.deliveryStatus,
  attempts: email.attempts,
  lastError: email.lastError,
  providerMessageId: email.providerMessageId,
  source: email.source,
  createdAt: email.createdAt,
  reviewedAt: email.reviewedAt,
  sentAt: email.sentAt,
});

/** The body of `POST /api/emails` (§3.2). */
export type SubmitEmailPayloadT = {
  from: AddressViewT;
  to: VRefine<Array<AddressViewT>, { minItems: 1, maxItems: 100 }>;
  cc?: VRefine<Array<AddressViewT>, { maxItems: 100 }>;
  bcc?: VRefine<Array<AddressViewT>, { maxItems: 100 }>;
  subject: VRefine<string, { maxLength: 998 }>;
  text?: string;
  html?: string;
};

/** The structured error body every endpoint answers failures with (§6). */
export type ErrorViewT = {
  error: string;
  code: string;
};
