import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// AES-256-GCM secret storage for integration credentials (e.g. the DoneDeal API key).
// The key comes from INTEGRATIONS_ENCRYPTION_KEY (any passphrase → sha256 → 32 bytes).
// Ciphertext format: base64(iv[12] | authTag[16] | ciphertext). Server-only.

function encryptionKey(): Buffer | null {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

/** True when INTEGRATIONS_ENCRYPTION_KEY is configured (secrets can be stored). */
export function secretStorageEnabled(): boolean {
  return encryptionKey() !== null;
}

export function encryptSecret(plain: string): string {
  const key = encryptionKey();
  if (!key) throw new Error("INTEGRATIONS_ENCRYPTION_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const key = encryptionKey();
  if (!key) throw new Error("INTEGRATIONS_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
