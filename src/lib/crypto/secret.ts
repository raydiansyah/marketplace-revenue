/**
 * Module: Secret Encryption Helper
 * Purpose: AES-256-GCM symmetric encryption/decryption for storing sensitive API keys at rest
 * Used by: src/app/api/admin/ai-providers/route.ts, src/lib/ai/provider-factory.ts
 * Dependencies: Node.js built-in crypto (no external deps)
 * Public functions: encryptSecret(), decryptSecret()
 * Side effects: Reads AI_SECRET_ENCRYPTION_KEY env var (must be 32-byte base64-encoded string)
 *
 * Key generation: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;    // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;   // 128-bit auth tag

function getKey(): Buffer {
  const key = process.env.AI_SECRET_ENCRYPTION_KEY;
  if (!key) throw new Error("AI_SECRET_ENCRYPTION_KEY env var not set");
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("AI_SECRET_ENCRYPTION_KEY must be exactly 32 bytes when base64-decoded");
  }
  return buf;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string containing: iv(12 bytes) + authTag(16 bytes) + ciphertext.
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Layout: [iv(12)] [authTag(16)] [ciphertext(variable)]
  const combined = Buffer.concat([iv, authTag, ciphertext]);
  return combined.toString("base64");
}

/**
 * Decrypt a base64 string produced by encryptSecret().
 * Throws if the auth tag is invalid (tampering detected) or key is wrong.
 */
export function decryptSecret(encrypted: string): string {
  const key = getKey();
  const combined = Buffer.from(encrypted, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
