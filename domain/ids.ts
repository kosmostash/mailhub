import { randomBytes, randomUUID, timingSafeEqual, createHash } from "node:crypto";

/** Ids for objects whose id is never a credential. */
export const newId = (): string => randomUUID();

/**
 * A collection id doubles as its API key (§2.3), so it has to be unguessable
 * rather than merely unique: 32 random bytes, base32-ish so it survives being
 * pasted into an SMTP username field or a shell variable without escaping.
 */
export const newCollectionId = (): string => {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(32);
  let out = "col_";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
};

/** The raw session token handed to the browser; only its hash is stored. */
export const newSessionToken = (): string => randomBytes(32).toString("base64url");

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** A confirmation code a human retypes: digits only, no ambiguity (§2.1.7). */
export const newConfirmationCode = (): string => {
  const digits = randomBytes(6);
  let code = "";
  for (const byte of digits) code += String(byte % 10);
  return code;
};

/** Constant-time comparison for anything secret-shaped. */
export const secretEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};
