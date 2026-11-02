import { describe, expect, it, vi } from "vitest";
import { cutoffSql, NEVER_PURGED, purgeStatement, runSecurityRetentionWith, SECURITY_RETENTION_TARGETS } from "@/server/ops/security-retention";

// DR-06 (owner, 2 Nov 2026): security and sign-in records older than 90 days
// are deleted in batches; requests and their history never are.
describe("security records retention (DR-06)", () => {
  it("the cutoff is 90 days, worked out in SQL", () => {
    expect(cutoffSql()).toBe("DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 90 DAY)");
    expect(() => cutoffSql(0)).toThrow();
    expect(() => cutoffSql(1.5)).toThrow();
  });

  it("selects only the security tables, never requests, history, audit or notifications", () => {
    const tables = SECURITY_RETENTION_TARGETS.map((target) => target.table);
    expect(tables).toEqual(["login_logs", "otp_challenges", "user_sessions", "used_security_links", "password_tokens"]);
    for (const table of NEVER_PURGED) expect(tables).not.toContain(table);
    for (const target of SECURITY_RETENTION_TARGETS) expect(purgeStatement(target).sql).not.toMatch(/approval_|request_|audit_logs|notification/);
  });

  it("every statement is batched, past the cutoff, and spares people under a legal hold", () => {
    for (const target of SECURITY_RETENTION_TARGETS) {
      const { sql, params } = purgeStatement(target, 90, 500);
      expect(sql).toMatch(new RegExp(`^DELETE FROM ${target.table} WHERE `));
      expect(sql).toContain("DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 90 DAY)");
      expect(sql).not.toContain("{cutoff}");
      expect(sql.endsWith("LIMIT ?")).toBe(true);
      expect(params).toEqual([500]);
      if (target.userColumn) expect(sql).toContain("h.scope_type = 'REQUESTER'");
    }
  });

  it("sessions: only ones that ended before the cutoff (revoked, or expired without a revoke)", () => {
    const { sql } = purgeStatement(SECURITY_RETENTION_TARGETS.find((target) => target.table === "user_sessions")!);
    expect(sql).toContain("(revoked_at IS NOT NULL AND revoked_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 90 DAY))");
    expect(sql).toContain("(revoked_at IS NULL AND expires_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 90 DAY))");
  });

  it("deletes batch after batch until a short batch, sums and audits the counts", async () => {
    const affected: Record<string, number[]> = { login_logs: [3, 3, 1], otp_challenges: [0], user_sessions: [2], used_security_links: [0], password_tokens: [0] };
    const query = vi.fn(async (sql: string) => {
      const table = sql.match(/^DELETE FROM (\w+)/)![1]!;
      return [{ affectedRows: affected[table]!.shift() ?? 0 }];
    });
    const audit = vi.fn(async () => undefined);
    const result = await runSecurityRetentionWith({ db: { query } as never, doneRecently: async () => false, audit }, { batch: 3 });
    expect(result).toMatchObject({ securityRetention: "DONE", deleted: 9, loginLogs: 7, otpChallenges: 0, endedSessions: 2 });
    expect(query).toHaveBeenCalledTimes(7);
    expect(audit).toHaveBeenCalledWith({ loginLogs: 7, otpChallenges: 0, endedSessions: 2, usedSecurityLinks: 0, passwordTokens: 0 });
  });

  it("stops at the per-run cap (PARTIAL), and nothing is audited when nothing was deleted", async () => {
    const full = vi.fn(async () => [{ affectedRows: 2 }]);
    const capped = await runSecurityRetentionWith({ db: { query: full } as never, doneRecently: async () => false, audit: async () => undefined }, { batch: 2, maxBatches: 3 });
    expect(capped.securityRetention).toBe("PARTIAL");
    expect(capped.loginLogs).toBe(6);

    const audit = vi.fn(async () => undefined);
    const empty = await runSecurityRetentionWith({ db: { query: vi.fn(async () => [{ affectedRows: 0 }]) } as never, doneRecently: async () => false, audit });
    expect(empty).toMatchObject({ securityRetention: "DONE", deleted: 0 });
    expect(audit).not.toHaveBeenCalled();
  });

  it("runs at most once a day once a run finished", async () => {
    const query = vi.fn();
    expect(await runSecurityRetentionWith({ db: { query } as never, doneRecently: async () => true, audit: async () => undefined })).toEqual({ securityRetention: "NOT_DUE", deleted: 0 });
    expect(query).not.toHaveBeenCalled();
  });
});
