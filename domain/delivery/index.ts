import { invalid, upstreamFailure } from "../errors";
import type { ProviderT, ProviderTypeT } from "../types";
import { smtpTransport } from "./smtp";
import type { TransportFactoryT, TransportT } from "./types";

export type { DeliveryResultT, OutgoingMessageT, TransportT } from "./types";
export { messageOf } from "./types";

/**
 * The provider-type registry (§2.4).
 *
 * A type may be *registered* without being *implemented*. That is deliberate:
 * the UI can offer it, an admin can configure it, and a send through it fails
 * with a clear "not implemented" - never a silently dropped email.
 */

/** Registered but not implemented: configurable, and loud when asked to send. */
const notImplemented = (type: string, label: string): TransportFactoryT => ({
  validateConfig: (config) => {
    if (typeof config !== "object" || config === null || Array.isArray(config)) {
      throw invalid(`${label} configuration must be an object`, "invalid_provider_config");
    }
    return config as Record<string, unknown>;
  },
  create: () => ({
    type,
    send: async () => {
      throw upstreamFailure(
        `The ${label} provider type is registered but not implemented in this installation`,
        "provider_not_implemented",
      );
    },
  }),
  redact: (config) => {
    const hidden = ["apiKey", "secretAccessKey", "token", "password", "pass"];
    return Object.fromEntries(
      Object.entries(config).map(([key, value]) =>
        hidden.includes(key) && value ? [key, "••••••••"] : [key, value],
      ),
    );
  },
});

const registry: Record<ProviderTypeT, TransportFactoryT> = {
  smtp: smtpTransport,
  sendgrid: notImplemented("sendgrid", "SendGrid"),
  ses: notImplemented("ses", "Amazon SES"),
};

/** What an admin can pick from, and what an operator sees as a bare label. */
export const providerTypes: Array<{ type: ProviderTypeT; label: string; implemented: boolean }> = [
  { type: "smtp", label: "SMTP", implemented: true },
  { type: "sendgrid", label: "SendGrid", implemented: false },
  { type: "ses", label: "Amazon SES", implemented: false },
];

export const isProviderType = (value: string): value is ProviderTypeT => value in registry;

export const factoryFor = (type: ProviderTypeT): TransportFactoryT => registry[type];

/**
 * Transports are cached per provider revision: one nodemailer pool per
 * provider, rebuilt when its configuration changes rather than per send.
 */
const cache = new Map<string, { revision: string; transport: TransportT }>();

export const transportFor = (provider: ProviderT): TransportT => {
  const cached = cache.get(provider.id);
  if (cached && cached.revision === provider.updatedAt) return cached.transport;

  void cached?.transport.close?.();

  const transport = factoryFor(provider.type).create(provider);
  cache.set(provider.id, { revision: provider.updatedAt, transport });
  return transport;
};

/** Drop every pooled connection - dev-server teardown and worker shutdown. */
export const closeTransports = async (): Promise<void> => {
  const open = [...cache.values()];
  cache.clear();
  await Promise.all(open.map(({ transport }) => transport.close?.()));
};
