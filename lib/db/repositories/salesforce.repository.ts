import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// D-172: the one Salesforce connection row (id = 1). Tokens and the PKCE
// verifier are stored encrypted by the caller; the state only as a hash.
export interface SalesforceConnectionRow {
  status: "DISCONNECTED" | "CONNECTED" | "NEEDS_REAUTH";
  instanceUrl: string | null;
  connectedUserName: string | null;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  scopes: string | null;
  pendingStateHash: string | null;
  pendingVerifierEnc: string | null;
  pendingUserId: number | null;
  pendingExpired: boolean;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  lastError: string | null;
  connectedAt: Date | null;
}

export async function getConnection(db: Queryable = getDbPool()): Promise<SalesforceConnectionRow> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT *, (pending_expires_at IS NULL OR pending_expires_at <= CURRENT_TIMESTAMP) AS pending_expired FROM ai_salesforce_connection WHERE id = 1");
  const row = rows[0];
  if (!row) {
    await db.query("INSERT IGNORE INTO ai_salesforce_connection (id) VALUES (1)");
    return getConnection(db);
  }
  return {
    status: row.status,
    instanceUrl: row.instance_url,
    connectedUserName: row.connected_user_name,
    accessTokenEnc: row.access_token_enc,
    refreshTokenEnc: row.refresh_token_enc,
    scopes: row.scopes,
    pendingStateHash: row.pending_state_hash,
    pendingVerifierEnc: row.pending_verifier_enc,
    pendingUserId: row.pending_user_id,
    pendingExpired: Number(row.pending_expired) === 1,
    lastTestAt: row.last_test_at,
    lastTestOk: row.last_test_ok === null ? null : Number(row.last_test_ok) === 1,
    lastError: row.last_error,
    connectedAt: row.connected_at,
  };
}

export async function savePending(input: { stateHash: string; verifierEnc: string; userId: number }, db: Queryable = getDbPool()): Promise<void> {
  await db.query(
    "UPDATE ai_salesforce_connection SET pending_state_hash = ?, pending_verifier_enc = ?, pending_user_id = ?, pending_expires_at = CURRENT_TIMESTAMP + INTERVAL 10 MINUTE WHERE id = 1",
    [input.stateHash, input.verifierEnc, input.userId],
  );
}

export async function clearPending(db: Queryable = getDbPool()): Promise<void> {
  await db.query("UPDATE ai_salesforce_connection SET pending_state_hash = NULL, pending_verifier_enc = NULL, pending_user_id = NULL, pending_expires_at = NULL WHERE id = 1");
}

export async function saveConnected(
  input: { instanceUrl: string; userName: string | null; accessTokenEnc: string; refreshTokenEnc: string | null; scopes: string | null; connectedBy: number },
  db: Queryable = getDbPool(),
): Promise<void> {
  await db.query(
    `UPDATE ai_salesforce_connection SET status = 'CONNECTED', instance_url = ?, connected_user_name = ?, access_token_enc = ?, refresh_token_enc = ?, scopes = ?,
       connected_by = ?, connected_at = CURRENT_TIMESTAMP, last_error = NULL,
       pending_state_hash = NULL, pending_verifier_enc = NULL, pending_user_id = NULL, pending_expires_at = NULL
     WHERE id = 1`,
    [input.instanceUrl, input.userName, input.accessTokenEnc, input.refreshTokenEnc, input.scopes, input.connectedBy],
  );
}

export async function saveAccessToken(accessTokenEnc: string, db: Queryable = getDbPool()): Promise<void> {
  await db.query("UPDATE ai_salesforce_connection SET access_token_enc = ?, status = 'CONNECTED', last_error = NULL WHERE id = 1", [accessTokenEnc]);
}

export async function markNeedsReauth(error: string, db: Queryable = getDbPool()): Promise<void> {
  await db.query("UPDATE ai_salesforce_connection SET status = 'NEEDS_REAUTH', access_token_enc = NULL, last_error = ? WHERE id = 1", [error.slice(0, 300)]);
}

export async function saveTest(ok: boolean, error: string | null, db: Queryable = getDbPool()): Promise<void> {
  await db.query("UPDATE ai_salesforce_connection SET last_test_at = CURRENT_TIMESTAMP, last_test_ok = ?, last_error = ? WHERE id = 1", [ok, error ? error.slice(0, 300) : null]);
}

export async function clearConnection(db: Queryable = getDbPool()): Promise<void> {
  await db.query(
    `UPDATE ai_salesforce_connection SET status = 'DISCONNECTED', instance_url = NULL, connected_user_name = NULL, access_token_enc = NULL, refresh_token_enc = NULL,
       scopes = NULL, connected_by = NULL, connected_at = NULL, last_test_at = NULL, last_test_ok = NULL, last_error = NULL WHERE id = 1`,
  );
}
