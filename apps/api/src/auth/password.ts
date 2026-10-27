import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const SCHEME = "scrypt";
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * Hashes a password with a per-user random salt. The stored format is
 * `scrypt$<salt base64url>$<derived key base64url>`; scrypt parameters are the
 * Node.js defaults (N=16384, r=8, p=1).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scrypt(password, salt, KEY_BYTES)) as Buffer;
  return [SCHEME, salt.toString("base64url"), derived.toString("base64url")].join("$");
}

/** Constant-time password verification, safe against malformed stored hashes. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, saltValue, keyValue, ...rest] = storedHash.split("$");
  if (scheme !== SCHEME || !saltValue || !keyValue || rest.length > 0) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltValue, "base64url");
    expected = Buffer.from(keyValue, "base64url");
  } catch {
    return false;
  }
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;

  const derived = (await scrypt(password, salt, KEY_BYTES)) as Buffer;
  return timingSafeEqual(derived, expected);
}
