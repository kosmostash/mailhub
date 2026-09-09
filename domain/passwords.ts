import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { invalid } from "./errors";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt from `node:crypto` - a modern KDF with no native dependency to build
 * or keep patched, which matters for something meant to be self-hosted.
 *
 * Parameters are stored in the hash string, so raising them later re-verifies
 * old hashes correctly and only new passwords use the stronger settings.
 */
const params = { N: 2 ** 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const keyLength = 64;

export const MIN_PASSWORD_LENGTH = 10;

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, keyLength, params);
  return [
    "scrypt",
    params.N,
    params.r,
    params.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !key) return false;

  const expected = Buffer.from(key, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: params.maxmem,
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

/**
 * The one password rule, applied everywhere a password is set: self-service
 * changes and administrative resets alike, so a reset can never install a
 * weaker secret than the account holder could choose themselves.
 */
export const assertPasswordAcceptable = (password: string): void => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw invalid(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
      "password_too_short",
    );
  }
};
