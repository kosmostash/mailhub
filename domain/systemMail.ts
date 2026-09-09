import nodemailer, { type Transporter } from "nodemailer";

import { db } from "@/db";

import { now } from "./clock";
import { config } from "./config";
import { tooManyRequests } from "./errors";
import { newId } from "./ids";

/**
 * System email (§2.1.8) - mail MailHub sends on its own behalf.
 *
 * It is a category apart from the emails MailHub stores for its users: no
 * collection, no provider, no review queue, no send pipeline, and nothing of
 * it in the admin UI's email lists. It goes out through the installation's own
 * mail path, immediately, because a confirmation code that waits is useless.
 *
 * Every send is recorded, and that record is what rate limiting reads - the
 * gate must not be turnable into a mail cannon.
 */

export type SystemMailPurposeT = "email_change_code" | "password_change_code";

let transporter: Transporter | undefined;
let logOnly = false;

const transport = (): Transporter => {
  if (transporter) return transporter;

  const { host, port, secure, user, pass } = config.systemMail;

  if (host) {
    logOnly = false;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  } else {
    // No system-mail host configured: fall back to a transport that writes the
    // message to the log. A fresh install still works end to end - the
    // confirmation code is simply read from the console.
    logOnly = true;
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }

  return transporter;
};

export const close = (): void => {
  transporter?.close();
  transporter = undefined;
};

/**
 * Install a transport explicitly, bypassing the environment.
 *
 * The same seam `setClock` provides for time: the test suite points system
 * mail at a real SMTP sink so the confirmation flow is exercised end to end,
 * rather than asserting against a mock.
 */
export const setTransport = (custom: Transporter | undefined): void => {
  transporter?.close();
  transporter = custom;
  logOnly = false;
};

/**
 * Requests already made inside the rate window, counted per recipient *and*
 * per account - so neither hammering one address nor spraying many from one
 * account gets past the limit.
 */
const recentCount = (recipient: string, userId: string | null): number => {
  const since = new Date(
    Date.now() - config.confirmation.rateWindowMinutes * 60_000,
  ).toISOString();

  const { n } = db()
    .prepare<[string, string, string | null, string], { n: number }>(
      `SELECT COUNT(*) AS n FROM system_emails
        WHERE created_at >= ?
          AND (recipient = ? OR (user_id IS NOT NULL AND user_id = ?))
          AND purpose LIKE ?`,
    )
    .get(since, recipient, userId, "%_code")!;

  return n;
};

export const assertWithinRateLimit = (recipient: string, userId: string | null): void => {
  if (recentCount(recipient, userId) >= config.confirmation.rateLimit) {
    throw tooManyRequests(
      "Too many confirmation codes requested - wait a while before trying again",
    );
  }
};

export type SystemMailT = {
  to: string;
  subject: string;
  text: string;
  purpose: SystemMailPurposeT;
  userId?: string | null;
};

/** Send now, and record it whether or not the send succeeded. */
export const send = async (message: SystemMailT): Promise<void> => {
  const id = newId();
  let error: string | null = null;

  try {
    await transport().sendMail({
      from: config.systemMail.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });

    if (logOnly) {
      // The fallback swallows the message, so print it: on an install with no
      // MTA yet, the console is where the confirmation code lives.
      console.info(
        `[mailhub] system email (${message.purpose}) -> ${message.to}\n${message.text}`,
      );
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
    console.error(`[mailhub] system email to ${message.to} failed: ${error}`);
  }

  db()
    .prepare(
      `INSERT INTO system_emails (id, recipient, purpose, user_id, delivered, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, message.to, message.purpose, message.userId ?? null, error ? 0 : 1, error, now());

  // A failed send is not silent: the caller has to know the code never left.
  if (error) throw new Error(`System email could not be sent: ${error}`);
};
