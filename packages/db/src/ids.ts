import { randomBytes } from "node:crypto";

const HEX = "0123456789abcdef";

/**
 * Generates a UUID v7 (time-ordered) identifier.
 * The project uses v7 so IDs sort by creation time across web and SQLite.
 */
export function uuidv7(now = Date.now()): string {
  const bytes = randomBytes(16);

  // 48-bit big-endian Unix timestamp in milliseconds.
  bytes[0] = Math.floor(now / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(now / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(now / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(now / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  let out = "";
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += "-";
    const byte = bytes[i];
    out += HEX[byte >> 4] + HEX[byte & 0x0f];
  }
  return out;
}
