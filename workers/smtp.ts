import { simpleParser, type AddressObject } from "mailparser";
import { SMTPServer, type SMTPServerAuthentication, type SMTPServerSession } from "smtp-server";

import { closeDb, db } from "@/db";
import * as activity from "@/domain/activity";
import * as accounts from "@/domain/accounts";
import * as collections from "@/domain/collections";
import { config } from "@/domain/config";
import * as emails from "@/domain/emails";
import { MailhubError } from "@/domain/errors";
import type { AddressT, CollectionT } from "@/domain/types";

/**
 * SMTP ingestion (§3.6).
 *
 * Anything that already sends mail - a legacy app, a framework's stock mailer,
 * an appliance - can submit to MailHub with zero code changes: point its
 * outgoing SMTP settings here.
 *
 * Two rules define the behaviour, and both are enforced below:
 *
 *   The collection id is the credential, presented via SMTP AUTH. Unknown
 *   credentials are rejected at authentication time, and a suspended owner is
 *   rejected distinguishably - the same 401/403 split as the HTTP door.
 *
 *   An accepted message is stored, never relayed. MailHub is not an open
 *   relay: the `250` means the message is durably stored, and it enters the
 *   lifecycle exactly like an HTTP submission - `pending` or `ready` per the
 *   collection's schedule mode. Sending happens later, through the
 *   collection's provider, like any other email.
 */

type IngestSessionT = SMTPServerSession & { mailhubCollection?: CollectionT };

const addressesOf = (value: AddressObject | Array<AddressObject> | undefined): Array<AddressT> => {
  if (!value) return [];
  const groups = Array.isArray(value) ? value : [value];

  return groups.flatMap((group) =>
    group.value.flatMap((entry) =>
      entry.address
        ? [entry.name ? { address: entry.address, name: entry.name } : { address: entry.address }]
        : [],
    ),
  );
};

const authenticate = (
  auth: SMTPServerAuthentication,
  session: SMTPServerSession,
  callback: (error?: Error | null, response?: { user: string }) => void,
): void => {
  // The collection id may arrive as either half of the pair, so that clients
  // insisting on a username and a password can send it as either.
  const candidate = [auth.password, auth.username].find(
    (value) => typeof value === "string" && value.length > 0,
  );

  try {
    const { collection } = collections.authorizeSubmission(candidate);
    (session as IngestSessionT).mailhubCollection = collection;
    callback(null, { user: collection.id });
  } catch (error) {
    // 535 for an id that names nothing, 550 for one whose owner is suspended -
    // so the sending system can tell "fix your configuration" from "reach for
    // a human", exactly as the HTTP door does.
    const suspended = error instanceof MailhubError && error.statusCode === 403;
    const response = Object.assign(
      new Error(
        suspended
          ? "550 This collection is suspended"
          : "535 Unknown collection id",
      ),
      { responseCode: suspended ? 550 : 535 },
    );
    callback(response);
  }
};

const onData = (
  stream: NodeJS.ReadableStream,
  session: SMTPServerSession,
  callback: (error?: Error | null) => void,
): void => {
  const collection = (session as IngestSessionT).mailhubCollection;
  if (!collection) {
    callback(Object.assign(new Error("530 Authentication required"), { responseCode: 530 }));
    return;
  }

  const chunks: Array<Buffer> = [];
  let size = 0;

  stream.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size <= config.smtpIngest.maxSize) chunks.push(chunk);
  });

  stream.on("error", (error) => callback(error));

  stream.on("end", () => {
    void (async () => {
      try {
        if (size > config.smtpIngest.maxSize) {
          throw Object.assign(new Error("552 Message too large"), { responseCode: 552 });
        }

        const parsed = await simpleParser(Buffer.concat(chunks));

        const from = addressesOf(parsed.from)[0] ?? {
          address: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
        };

        // Envelope recipients win over header ones: they are who the sending
        // system actually addressed, and Bcc never appears in the headers.
        const headerTo = addressesOf(parsed.to);
        const envelopeTo = session.envelope.rcptTo.map(({ address }) => ({ address }));
        const to = headerTo.length ? headerTo : envelopeTo;

        const email = emails.submit(
          collection,
          {
            from,
            to,
            cc: addressesOf(parsed.cc),
            bcc: addressesOf(parsed.bcc),
            subject: parsed.subject ?? "",
            text: parsed.text ?? null,
            html: typeof parsed.html === "string" ? parsed.html : null,
          },
          "smtp",
        );

        const owner = accounts.findById(collection.operatorId);
        activity.record({
          action: "email.receive_smtp",
          objectType: "email",
          objectId: email.id,
          objectLabel: email.subject,
          actor: "smtp",
          scope: { adminId: owner?.adminId ?? null, operatorId: collection.operatorId },
          detail: { collectionId: collection.id, state: email.state },
        });

        // The 250 goes out only now: acceptance means durably stored, the same
        // no-silent-loss guarantee as everywhere else (§6).
        callback();
      } catch (error) {
        console.error("[smtp] rejected a message:", error);
        callback(
          error instanceof Error
            ? error
            : new Error("451 Could not store the message"),
        );
      }
    })();
  });
};

const server = new SMTPServer({
  name: config.smtpIngest.banner,
  // No TLS certificate is configured by default: this listener belongs on a
  // LAN/DMZ, never on the public internet (§3.1), and STARTTLS advertised
  // without a certificate is worse than not advertising it.
  disabledCommands: ["STARTTLS"],
  authMethods: ["PLAIN", "LOGIN"],
  size: config.smtpIngest.maxSize,
  onAuth: authenticate,
  onData,
});

server.on("error", (error) => console.error("[smtp] server error:", error));

const shutdown = (signal: string): void => {
  console.info(`[smtp] ${signal} - closing the listener`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

db().prepare("SELECT 1").get();

server.listen(config.smtpIngest.port, config.smtpIngest.host, () => {
  console.info(
    `[smtp] listening on ${config.smtpIngest.host}:${config.smtpIngest.port} - ` +
      "authenticate with a collection id",
  );
});
