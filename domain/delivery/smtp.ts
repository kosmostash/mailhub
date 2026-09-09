import nodemailer, { type Transporter } from "nodemailer";

import { invalid, upstreamFailure } from "../errors";
import type { ProviderT, SmtpProviderConfigT } from "../types";
import type { DeliveryResultT, OutgoingMessageT, TransportFactoryT, TransportT } from "./types";

/**
 * The SMTP provider - the one type every implementation must support (§2.4).
 *
 * Nothing here knows about collections, review state or the sender's retry
 * policy: a transport hands a message to a server and reports what came back.
 */

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid("SMTP configuration must be an object", "invalid_provider_config");
  }
  return value as Record<string, unknown>;
};

const validateConfig = (value: unknown): Record<string, unknown> => {
  const raw = asRecord(value);

  const host = typeof raw.host === "string" ? raw.host.trim() : "";
  if (!host) throw invalid("SMTP host is required", "invalid_provider_config");

  const port = Number(raw.port ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw invalid("SMTP port must be a whole number between 1 and 65535", "invalid_provider_config");
  }

  const user = typeof raw.user === "string" && raw.user ? raw.user : undefined;
  const pass = typeof raw.pass === "string" && raw.pass ? raw.pass : undefined;
  if (user && !pass) {
    throw invalid("An SMTP username needs a password", "invalid_provider_config");
  }

  const config: SmtpProviderConfigT = {
    host,
    port,
    secure: raw.secure === true,
    ...(user ? { user } : {}),
    ...(pass ? { pass } : {}),
    ...(raw.allowInsecureTls === true ? { allowInsecureTls: true } : {}),
  };

  return config as unknown as Record<string, unknown>;
};

const addressList = (list: OutgoingMessageT["to"]) =>
  list.map((entry) => (entry.name ? { name: entry.name, address: entry.address } : entry.address));

const create = (provider: ProviderT): TransportT => {
  const config = validateConfig(provider.config) as unknown as SmtpProviderConfigT;

  let transporter: Transporter | undefined;
  const connect = (): Transporter =>
    (transporter ??= nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user && config.pass
        ? { auth: { user: config.user, pass: config.pass } }
        : {}),
      ...(config.allowInsecureTls ? { tls: { rejectUnauthorized: false } } : {}),
    }));

  return {
    type: "smtp",

    async send(message): Promise<DeliveryResultT> {
      try {
        const info = await connect().sendMail({
          from: message.from.name
            ? { name: message.from.name, address: message.from.address }
            : message.from.address,
          to: addressList(message.to),
          ...(message.cc.length ? { cc: addressList(message.cc) } : {}),
          ...(message.bcc.length ? { bcc: addressList(message.bcc) } : {}),
          subject: message.subject,
          ...(message.text ? { text: message.text } : {}),
          ...(message.html ? { html: message.html } : {}),
        });

        // Plain SMTP has no feedback channel: the server accepting the message
        // is the last thing we will ever hear about it (§2.7).
        return { messageId: info.messageId ?? null, deliveryStatus: "sent" };
      } catch (error) {
        throw upstreamFailure(error instanceof Error ? error.message : String(error));
      }
    },

    async close() {
      transporter?.close();
      transporter = undefined;
    },
  };
};

const redact = (config: Record<string, unknown>): Record<string, unknown> => ({
  ...config,
  ...(config.pass ? { pass: "••••••••" } : {}),
});

export const smtpTransport: TransportFactoryT = { validateConfig, create, redact };
