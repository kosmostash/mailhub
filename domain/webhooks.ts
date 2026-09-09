import { createHmac, timingSafeEqual } from "node:crypto";

import { config } from "./config";
import type { DeliveryEventT } from "./emails";
import { forbidden, invalid } from "./errors";

/**
 * Delivery-event webhooks (§3.4).
 *
 * This is the one part of MailHub that is public by nature - a provider has to
 * be able to reach it from the internet - so it protects itself with a
 * signature rather than with the collection id that guards the private
 * submission API.
 *
 * Two shapes are accepted. MailHub's own normalized batch is what an
 * installation wires up by hand; a provider-native parser can be registered
 * beside it, and both go through the same signature check first.
 */

export type WebhookParserT = {
  /** Turn a provider's own payload into normalized events. */
  parse: (rawBody: string, headers: Headers) => Array<DeliveryEventT>;
  /**
   * Verify the provider's signature over the *raw* request bytes. Omitted for
   * the normalized endpoint, which uses the shared HMAC scheme below.
   */
  verify?: (rawBody: string, headers: Headers, key: string) => boolean;
};

const statusOf = (value: unknown): DeliveryEventT["status"] | undefined =>
  value === "sent" || value === "delivered" || value === "bounced" ? value : undefined;

/**
 * MailHub's normalized batch: `{ events: [{ emailId | messageId, status }] }`,
 * or a bare array of the same entries.
 */
const parseNormalized = (rawBody: string): Array<DeliveryEventT> => {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw invalid("Body is not valid JSON", "invalid_payload");
  }

  const list = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null && Array.isArray((payload as { events?: unknown }).events)
      ? ((payload as { events: Array<unknown> }).events)
      : undefined;

  if (!list) throw invalid("Expected an array of events", "invalid_payload");

  return list.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const event = entry as Record<string, unknown>;

    const status = statusOf(event.status);
    if (!status) return [];

    const emailId = typeof event.emailId === "string" ? event.emailId : undefined;
    const providerMessageId =
      typeof event.messageId === "string"
        ? event.messageId
        : typeof event.providerMessageId === "string"
          ? event.providerMessageId
          : undefined;

    // An event that names no message correlates with nothing; it is dropped
    // here and counted as unmatched by the caller.
    if (!emailId && !providerMessageId) return [];

    return [{ emailId, providerMessageId, status }];
  });
};

const parsers = new Map<string, WebhookParserT>();

/**
 * Register a provider-native parser. Hosted provider types ship registered but
 * unimplemented (§2.4), so none is registered here - the hook exists so adding
 * one is a module rather than a change to the route.
 */
export const registerParser = (providerType: string, parser: WebhookParserT): void => {
  parsers.set(providerType, parser);
};

export const SIGNATURE_HEADER = "x-mailhub-signature";

/** HMAC-SHA256 of the raw body, hex - the scheme the normalized endpoint uses. */
export const sign = (rawBody: string, key: string): string =>
  createHmac("sha256", key).update(rawBody).digest("hex");

const signatureMatches = (rawBody: string, headers: Headers, key: string): boolean => {
  const offered = headers.get(SIGNATURE_HEADER)?.trim().replace(/^sha256=/, "") ?? "";
  const expected = sign(rawBody, key);
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Accept a webhook delivery for `providerType` and return the events it
 * carries.
 *
 * Verification runs over the raw request bytes, before parsing. When no key is
 * configured for the provider type, unsigned events are accepted - that is the
 * documented behaviour (§3.4), and it is what makes a LAN-only installation
 * workable without inventing a secret it has nowhere to put.
 */
export const accept = (
  providerType: string,
  rawBody: string,
  headers: Headers,
): Array<DeliveryEventT> => {
  const parser = parsers.get(providerType);
  const key = config.webhookKeys[providerType];

  if (key) {
    const ok = parser?.verify
      ? parser.verify(rawBody, headers, key)
      : signatureMatches(rawBody, headers, key);
    if (!ok) throw forbidden("Signature does not match", "bad_signature");
  }

  return parser ? parser.parse(rawBody, headers) : parseNormalized(rawBody);
};
