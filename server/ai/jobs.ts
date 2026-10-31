import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { getSettingValue } from "@/server/settings/values";
import { loadSalesforceConfig, SALESFORCE_KEY, syncSalesforce } from "@/server/ai/connectors/salesforce";

// D-169 (AI module branch): the AI module's background work, on the job
// runner (every 5 minutes; the Salesforce copy at most hourly):
//   - pending proposals past their expiry are marked EXPIRED (never decided);
//   - conversations older than the retention setting are removed (0 keeps them);
//   - Salesforce is copied when it is set up and the last run is an hour old.
const SYNC_EVERY_MINUTES = 60;

export async function runAiStep(): Promise<Record<string, number | string>> {
  const db = getDbPool();
  const [expired] = await db.query<ResultSetHeader>("UPDATE ai_proposals SET status = 'EXPIRED', version = version + 1 WHERE status = 'PENDING' AND expires_at <= CURRENT_TIMESTAMP");

  let conversationsRemoved = 0;
  const keepDays = Number(await getSettingValue("ai.conversation_keep_days"));
  if (keepDays > 0) {
    // D-246 (audit DB-003): chats of someone under an active legal hold
    // (REQUESTER scope) are kept, and the three statements go together.
    const [old] = await db.query<RowDataPacket[]>(
      `SELECT c.id FROM ai_conversations c WHERE c.updated_at < CURRENT_TIMESTAMP - INTERVAL ? DAY
         AND NOT EXISTS (SELECT 1 FROM legal_holds h WHERE h.released_at IS NULL AND h.scope_type = 'REQUESTER' AND h.scope_id = c.owner_user_id)
       LIMIT 500`,
      [keepDays],
    );
    const ids = old.map((row) => row.id as number);
    if (ids.length) {
      conversationsRemoved = await withTransaction(async (connection) => {
        await connection.query("UPDATE ai_proposals SET conversation_id = NULL WHERE conversation_id IN (?)", [ids]);
        await connection.query("DELETE FROM ai_messages WHERE conversation_id IN (?)", [ids]);
        const [removed] = await connection.query<ResultSetHeader>("DELETE FROM ai_conversations WHERE id IN (?)", [ids]);
        return removed.affectedRows;
      });
    }
  }

  let salesforce = "not set up";
  if (await loadSalesforceConfig().catch(() => null)) {
    const [[last]] = await db.query<RowDataPacket[]>("SELECT TIMESTAMPDIFF(MINUTE, MAX(started_at), CURRENT_TIMESTAMP) AS minutes FROM ai_sync_runs WHERE source_key = ?", [SALESFORCE_KEY]);
    if (last?.minutes === null || last?.minutes === undefined || Number(last.minutes) >= SYNC_EVERY_MINUTES) {
      const summary = await syncSalesforce(null);
      salesforce = summary.ok ? "synced" : "failed";
    } else salesforce = "not due";
  }
  return { proposalsExpired: expired.affectedRows, conversationsRemoved, salesforce };
}
