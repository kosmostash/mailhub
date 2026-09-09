import { db, transaction } from "@/db";

import * as accounts from "./accounts";
import * as activity from "./activity";
import { inMinutes, isPast, now } from "./clock";
import { config } from "./config";
import { conflict, forbidden, invalid, notFound, unauthorized } from "./errors";
import { newConfirmationCode, newId, secretEquals, sha256 } from "./ids";
import { assertPasswordAcceptable, hashPassword, verifyPassword } from "./passwords";
import * as secondFactor from "./secondFactor";
import * as sessions from "./sessions";
import * as systemMail from "./systemMail";
import type { ActorT, UserT } from "./types";

/**
 * The credential-change gate (§2.1.7).
 *
 * Changing your own email or password takes more than holding a signed-in
 * session - for every role, superadmin included. Where the code goes depends on
 * what is changing, and each direction proves something different:
 *
 *   email    -> the NEW address     proves you control what you are moving to
 *   password -> the CURRENT address proves the request comes from the holder
 *
 * The pending value is held here and applied only on confirmation, so an
 * unconfirmed email change leaves the account on its old address.
 *
 * Administrative resets are deliberately *not* this flow: they are the
 * recovery path for an account that cannot complete it (§2.1.1/§2.1.2).
 */

export type ConfirmationPurposeT = "email" | "password";

type CodeRow = {
  id: string;
  user_id: string;
  purpose: string;
  code_hash: string;
  new_email: string | null;
  new_password_hash: string | null;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

export type PendingChangeT = {
  purpose: ConfirmationPurposeT;
  /** Where the code was sent - shown to the user, so they know where to look. */
  sentTo: string;
  expiresAt: string;
  /** Which factor has to answer: the emailed code, or an enrolled 2FA method. */
  via: "email_code" | string;
};

const findOpen = (userId: string, purpose: ConfirmationPurposeT): CodeRow | undefined =>
  db()
    .prepare<[string, string, string], CodeRow>(
      `SELECT * FROM confirmation_codes
        WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(userId, purpose, now());

/** Any outstanding request, so the UI can show the confirm step after a reload. */
export const pending = (user: UserT): PendingChangeT | undefined => {
  for (const purpose of ["email", "password"] as const) {
    const open = findOpen(user.id, purpose);
    if (!open) continue;
    return {
      purpose,
      sentTo: purpose === "email" ? (open.new_email ?? user.email) : user.email,
      expiresAt: open.expires_at,
      via: secondFactor.enrolledFor(user)?.kind ?? "email_code",
    };
  }
  return undefined;
};

const openRequest = async (input: {
  user: UserT;
  purpose: ConfirmationPurposeT;
  recipient: string;
  newEmail?: string;
  newPasswordHash?: string;
}): Promise<PendingChangeT> => {
  const { user, purpose, recipient } = input;

  const factor = secondFactor.enrolledFor(user);
  const code = newConfirmationCode();

  // Only the emailed path costs a message, so only it is rate limited.
  if (!factor) systemMail.assertWithinRateLimit(recipient, user.id);

  const expiresAt = inMinutes(config.confirmation.ttlMinutes);

  transaction(() => {
    // One outstanding request per purpose: asking again replaces the old code
    // rather than leaving several valid at once.
    db()
      .prepare(
        "UPDATE confirmation_codes SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL",
      )
      .run(now(), user.id, purpose);

    db()
      .prepare(
        `INSERT INTO confirmation_codes
           (id, user_id, purpose, code_hash, new_email, new_password_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId(),
        user.id,
        purpose,
        sha256(code),
        input.newEmail ?? null,
        input.newPasswordHash ?? null,
        expiresAt,
        now(),
      );
  });

  if (!factor) {
    await systemMail.send({
      to: recipient,
      subject:
        purpose === "email"
          ? "Confirm your new MailHub address"
          : "Confirm your MailHub password change",
      text: [
        purpose === "email"
          ? `Confirm this address as the new sign-in address for your MailHub account (${user.email}).`
          : "Confirm the password change on your MailHub account.",
        "",
        `Your confirmation code is: ${code}`,
        "",
        `It expires in ${config.confirmation.ttlMinutes} minutes and can be used once.`,
        "If you did not request this, ignore this message - nothing has changed.",
      ].join("\n"),
      purpose: purpose === "email" ? "email_change_code" : "password_change_code",
      userId: user.id,
    });
  }

  return {
    purpose,
    sentTo: recipient,
    expiresAt,
    via: factor?.kind ?? "email_code",
  };
};

/**
 * Ask to change your own email. The code goes to the new address, and the
 * account keeps the old one until that code comes back.
 */
export const requestEmailChange = async (
  actor: ActorT,
  newEmail: string,
): Promise<PendingChangeT> => {
  assertSelfService(actor);

  const email = accounts.normalizeEmail(newEmail);
  accounts.assertEmailAcceptable(email);

  if (email === actor.identity.email) {
    throw invalid("That is already your address", "email_unchanged");
  }
  if (accounts.findByEmail(email)) {
    throw conflict("That email address is already taken", "email_taken");
  }

  return openRequest({
    user: actor.identity,
    purpose: "email",
    recipient: email,
    newEmail: email,
  });
};

/**
 * Ask to change your own password. The current password is required as well as
 * the code, and the code goes to the address currently on the account.
 */
export const requestPasswordChange = async (
  actor: ActorT,
  input: { currentPassword: string; newPassword: string },
): Promise<PendingChangeT> => {
  assertSelfService(actor);
  assertPasswordAcceptable(input.newPassword);

  const stored = accounts.passwordHashOf(actor.identity.id);
  if (!stored || !(await verifyPassword(input.currentPassword, stored))) {
    throw unauthorized("Your current password is not correct", "bad_credentials");
  }

  return openRequest({
    user: actor.identity,
    purpose: "password",
    recipient: actor.identity.email,
    newPasswordHash: await hashPassword(input.newPassword),
  });
};

/**
 * Apply a pending change once the second factor - or the emailed code - has
 * answered. Codes are single-use, expire, and give up after a few wrong tries
 * so the six digits cannot simply be walked.
 */
export const confirm = async (
  actor: ActorT,
  purpose: ConfirmationPurposeT,
  response: string,
): Promise<UserT> => {
  assertSelfService(actor);

  const user = actor.identity;
  const open = findOpen(user.id, purpose);
  if (!open) throw notFound("Pending change");

  if (isPast(open.expires_at)) {
    throw conflict("That code has expired - request a new one", "code_expired");
  }
  if (open.attempts >= config.confirmation.maxAttempts) {
    throw conflict("Too many wrong codes - request a new one", "too_many_attempts");
  }

  const factor = secondFactor.enrolledFor(user);
  const ok = factor
    ? await factor.verify(user, response)
    : secretEquals(sha256(response.trim()), open.code_hash);

  if (!ok) {
    db()
      .prepare("UPDATE confirmation_codes SET attempts = attempts + 1 WHERE id = ?")
      .run(open.id);
    throw unauthorized("That confirmation code is not correct", "bad_code");
  }

  const timestamp = now();
  const updated = transaction(() => {
    db().prepare("UPDATE confirmation_codes SET consumed_at = ? WHERE id = ?").run(
      timestamp,
      open.id,
    );

    if (purpose === "email") {
      if (!open.new_email) throw conflict("Nothing to apply", "nothing_pending");
      if (accounts.findByEmail(open.new_email)) {
        throw conflict("That email address is already taken", "email_taken");
      }
      db()
        .prepare("UPDATE users SET email = ?, updated_at = ? WHERE id = ?")
        .run(open.new_email, timestamp, user.id);
      return { ...user, email: open.new_email, updatedAt: timestamp };
    }

    if (!open.new_password_hash) throw conflict("Nothing to apply", "nothing_pending");
    db()
      .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(open.new_password_hash, timestamp, user.id);
    return { ...user, updatedAt: timestamp };
  });

  if (purpose === "password") {
    // A new password ends every other session; this one stays, so the person
    // who just changed it is not signed out of the tab they are looking at.
    const current = actor.session.id;
    for (const row of db()
      .prepare<[string], { id: string }>("SELECT id FROM sessions WHERE user_id = ?")
      .all(user.id)) {
      if (row.id !== current) sessions.revoke(row.id);
    }
  }

  activity.record({
    action: purpose === "email" ? "account.change_email" : "account.change_password",
    objectType: "user",
    objectId: user.id,
    objectLabel: updated.email,
    actor,
    detail: purpose === "email" ? { from: user.email, to: updated.email } : null,
  });

  return updated;
};

/** Cancel an outstanding request - the UI's "start over". */
export const cancel = (actor: ActorT, purpose: ConfirmationPurposeT): void => {
  db()
    .prepare(
      "UPDATE confirmation_codes SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL",
    )
    .run(now(), actor.identity.id, purpose);
};

/**
 * Credential changes are self-service by definition: an impersonator changing
 * the assumed account's password would be a way to take it over, which is
 * exactly what the audited-convenience model of §2.2 is not for.
 */
function assertSelfService(actor: ActorT): void {
  if (actor.impersonating) {
    throw forbidden(
      "Credentials can only be changed by the account holder, not while impersonating",
      "impersonating",
    );
  }
}
