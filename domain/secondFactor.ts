import type { UserT } from "./types";

/**
 * The second-factor seam (§2.1.7).
 *
 * The spec puts two paths in front of a credential change, in order of
 * precedence: an enrolled second factor if the account has one, otherwise a
 * one-time code by email. Implementing 2FA is optional; the *gate* is not.
 *
 * This installation enrols no second factor, so `enrolledFor` always answers
 * `undefined` and every change goes through the emailed code. The seam exists
 * so that adding TOTP later is one module and one truthy answer here, rather
 * than a change to how confirmations work.
 */

export type SecondFactorT = {
  kind: string;
  /** Verify a challenge response. Returning false rejects the change. */
  verify: (user: UserT, response: string) => Promise<boolean>;
  /** Anything the UI needs to prompt with (a challenge id, a hint, ...). */
  challenge?: (user: UserT) => Promise<Record<string, unknown>>;
};

const factors = new Map<string, SecondFactorT>();

/** Register an implementation - the hook a TOTP module would use. */
export const registerFactor = (userId: string, factor: SecondFactorT): void => {
  factors.set(userId, factor);
};

export const enrolledFor = (user: UserT): SecondFactorT | undefined => factors.get(user.id);

export const hasSecondFactor = (user: UserT): boolean => enrolledFor(user) !== undefined;
