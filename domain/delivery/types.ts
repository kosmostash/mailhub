import type { AddressT, EmailT, ProviderT } from "../types";

/** What a transport is handed. `test` marks a "send to me" copy (§4.4). */
export type OutgoingMessageT = {
  from: AddressT;
  to: Array<AddressT>;
  cc: Array<AddressT>;
  bcc: Array<AddressT>;
  subject: string;
  text: string | null;
  html: string | null;
};

export type DeliveryResultT = {
  /** The provider's own id for the message, when it reports one (§2.7). */
  messageId: string | null;
  /**
   * The delivery status acceptance implies. Plain SMTP has no feedback
   * channel, so acceptance *is* the final word: `sent` and nothing more.
   * Providers with an event feed leave it at `sent` and let webhooks move it on.
   */
  deliveryStatus: "sent";
};

/**
 * One delivery backend. Adding a provider type means adding one of these and
 * registering it - nothing above this interface changes.
 */
export type TransportT = {
  type: string;
  send: (message: OutgoingMessageT) => Promise<DeliveryResultT>;
  /** Release sockets and pools. */
  close?: () => Promise<void>;
};

export type TransportFactoryT = {
  /** Reject a malformed configuration at create/update time, not at send time. */
  validateConfig: (config: unknown) => Record<string, unknown>;
  /** Build a transport, or throw a clear "not implemented" (§2.4). */
  create: (provider: ProviderT) => TransportT;
  /** Hide secrets before a configuration is shown in the UI (§5.6). */
  redact: (config: Record<string, unknown>) => Record<string, unknown>;
};

export const messageOf = (email: EmailT): OutgoingMessageT => ({
  from: email.from,
  to: email.to,
  cc: email.cc,
  bcc: email.bcc,
  subject: email.subject,
  text: email.text,
  html: email.html,
});
