import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // bytes (256 bits)
const CURRENT_VERSION = "v1";

function getKey(): Buffer {
  const hex = process.env.FLEX_TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error("FLEX_TOKEN_ENCRYPTION_KEY env var is not set");
  if (hex.length !== KEY_LENGTH * 2)
    throw new Error(
      `FLEX_TOKEN_ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes)`
    );
  return Buffer.from(hex, "hex");
}

// Format: "v1:iv:authTag:ciphertext" — all hex-encoded, colon-separated.
// Legacy 3-part values produced before the v1 prefix was introduced are
// accepted by decryptToken() for backward-compatible reads; the next time a
// caller re-encrypts the token (e.g., user rotates the IBKR Flex token) the
// new value is written with the v1 prefix.
export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    CURRENT_VERSION,
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

export function decryptToken(stored: string): string {
  const key = getKey();
  const parts = stored.split(":");

  let ivHex: string;
  let authTagHex: string;
  let ciphertextHex: string;

  if (parts.length === 4) {
    const [version, iv, tag, ct] = parts;
    if (version !== "v1") {
      throw new Error(`Unsupported encrypted-token version: ${version}`);
    }
    ivHex = iv;
    authTagHex = tag;
    ciphertextHex = ct;
  } else if (parts.length === 3) {
    // Legacy (pre-v1) format — same AES-256-GCM construction, just no prefix.
    [ivHex, authTagHex, ciphertextHex] = parts;
  } else {
    throw new Error("Invalid encrypted token format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
