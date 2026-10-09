import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

// A failed message is kept so the retry runner can send it again. Its body
// can hold a set-password or "This wasn't me" link, which works like a key
// to the account, so it is stored encrypted (AES-256-GCM, ENCRYPTION_KEY)
// and wiped once sent or after 7 days (audit S-01).
export function sealPayload(payload: Record<string, unknown>): { sealed: string } {
  return { sealed: encryptSecret(JSON.stringify(payload)) };
}

// Rows written before v1.3.6 are plain JSON; they are read as they are.
export function openPayload(stored: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!stored) return null;
  if (typeof stored.sealed !== "string") return stored;
  return JSON.parse(decryptSecret(stored.sealed)) as Record<string, unknown>;
}
