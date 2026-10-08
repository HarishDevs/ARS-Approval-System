import "server-only";
import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { withTransaction } from "@/lib/db/transaction";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { createSession, revokeAllSessionsForUser, revokeSession } from "@/lib/db/repositories/sessions.repository";
import { findUserById } from "@/lib/db/repositories/users.repository";
import { createSessionToken } from "@/lib/session/token";
import { SESSION_TTL_SECONDS } from "@/lib/session/constants";
import { createWorkflow, publishVersion, type Actor } from "@/server/approvals/service";
import {
  DEMO_DEPARTMENTS,
  DEMO_DESIGNATIONS,
  DEMO_GROUPS,
  DEMO_PEOPLE,
  demoEmail,
  demoLoginId,
  demoName,
  demoWorkflows,
  type DemoDepartmentCode,
  type DemoGroupCode,
} from "@/server/demo/demo-data";

// Demo data (S6-02a, F-57, D-071). Super Admin only (checked by the
// callers and again here). Loading is safe to repeat: anything that
// already exists is left as it is.
export interface DemoReport {
  people: number;
  departments: number;
  designations: number;
  groups: number;
  workflows: string[];
  skippedWorkflows: string[];
  problems: string[];
}

const isSuperAdmin = (actor: Actor) => actor.roles.includes("SUPER_ADMIN");

async function idByCode(table: "departments" | "designations" | "approver_groups", code: string, db: Queryable): Promise<number | null> {
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(`SELECT id FROM ${table} WHERE code = ?`, [code]);
  return rows[0]?.id ?? null;
}

export async function loadDemoData(actor: Actor): Promise<DemoReport> {
  if (!isSuperAdmin(actor)) throw new Error("FORBIDDEN");
  const report: DemoReport = { people: 0, departments: 0, designations: 0, groups: 0, workflows: [], skippedWorkflows: [], problems: [] };

  const ids = await withTransaction(async (db) => {
    const designations = new Map<string, number>();
    for (const designation of DEMO_DESIGNATIONS) {
      let id = await idByCode("designations", designation.code, db);
      if (id === null) {
        const [result] = await db.query<ResultSetHeader>("INSERT INTO designations (code, name, is_approver) VALUES (?, ?, ?)", [designation.code, designation.name, designation.approver]);
        id = result.insertId;
        report.designations += 1;
      }
      designations.set(designation.code, id);
    }

    const departments = new Map<string, number>();
    for (const department of DEMO_DEPARTMENTS) {
      let id = await idByCode("departments", department.code, db);
      if (id === null) {
        const [result] = await db.query<ResultSetHeader>("INSERT INTO departments (code, name) VALUES (?, ?)", [department.code, department.name]);
        id = result.insertId;
        report.departments += 1;
      }
      departments.set(department.code, id);
    }

    const people = new Map<string, number>();
    for (const person of DEMO_PEOPLE) {
      const [found] = await db.query<(RowDataPacket & { id: number })[]>("SELECT id FROM users WHERE login_id = ?", [demoLoginId(person.key)]);
      let id = found[0]?.id;
      if (id === undefined) {
        const [result] = await db.query<ResultSetHeader>(
          `INSERT INTO users (login_id, name, email, department_id, designation_id, reporting_manager_id, sign_in_method, is_demo, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'GOOGLE', TRUE, ?)`,
          [demoLoginId(person.key), demoName(person.name), demoEmail(person.key), departments.get(person.department), designations.get(person.designation), person.manager ? people.get(person.manager) : null, actor.id],
        );
        id = result.insertId;
        await db.query("INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) SELECT ?, id, ? FROM roles WHERE code = 'USER'", [id, actor.id]);
        report.people += 1;
      }
      people.set(person.key, id);
    }

    // A department keeps the HOD it already has; only empty ones get the demo HOD.
    for (const department of DEMO_DEPARTMENTS) {
      await db.query("UPDATE departments SET hod_user_id = ? WHERE id = ? AND hod_user_id IS NULL", [people.get(department.hod), departments.get(department.code)]);
    }

    const groups = new Map<string, number>();
    for (const group of DEMO_GROUPS) {
      let id = await idByCode("approver_groups", group.code, db);
      if (id === null) {
        const [result] = await db.query<ResultSetHeader>("INSERT INTO approver_groups (code, name, created_by) VALUES (?, ?, ?)", [group.code, group.name, actor.id]);
        id = result.insertId;
        report.groups += 1;
        for (const member of group.members) {
          await db.query("INSERT IGNORE INTO approver_group_members (group_id, user_id, added_by) VALUES (?, ?, ?)", [id, people.get(member), actor.id]);
        }
      }
      groups.set(group.code, id);
    }

    await recordAudit({ actorUserId: actor.id, action: "DEMO_DATA_LOADED", entityType: "SYSTEM", entityId: "demo", metadata: { ...report } }, db);
    return { departments, groups };
  });

  const workflows = demoWorkflows({
    department: (code: DemoDepartmentCode) => ids.departments.get(code)!,
    group: (code: DemoGroupCode) => ids.groups.get(code)!,
  });
  for (const workflow of workflows) {
    const [existing] = await getDbPool().query<(RowDataPacket & { id: number })[]>("SELECT id FROM workflow_definitions WHERE code = ?", [workflow.code]);
    if (existing.length) {
      report.skippedWorkflows.push(workflow.name);
      continue;
    }
    const created = await createWorkflow(
      { code: workflow.code, name: workflow.name, description: workflow.description, kind: "PREDEFINED", requestPrefix: workflow.prefix, builder: workflow.builder, form: workflow.form },
      actor,
    );
    if (!created.ok) {
      report.problems.push(`${workflow.name}: ${created.message}`);
      continue;
    }
    const published = await publishVersion(created.value.versionId, actor);
    if (!published.ok) report.problems.push(`${workflow.name} saved as a draft: ${published.validation?.errors.map((issue) => issue.message).join(" ") || published.message}`);
    else report.workflows.push(workflow.name);
  }
  return report;
}

export interface DemoPersonRow {
  id: number;
  loginId: string;
  name: string;
  department: string | null;
  designation: string | null;
  active: boolean;
  pendingTasks: number;
}

export async function listDemoPeople(db: Queryable = getDbPool()): Promise<DemoPersonRow[]> {
  const [rows] = await db.query<
    (RowDataPacket & { id: number; login_id: string; name: string; department: string | null; designation: string | null; active: number; pending: number })[]
  >(
    `SELECT u.id, u.login_id, u.name, d.name AS department, g.name AS designation, u.active,
       (SELECT COUNT(*) FROM approval_tasks t WHERE t.approver_id = u.id AND t.status = 'PENDING') AS pending
     FROM users u LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN designations g ON g.id = u.designation_id
     WHERE u.is_demo = TRUE ORDER BY u.id`,
  );
  return rows.map((row) => ({ id: row.id, loginId: row.login_id, name: row.name, department: row.department, designation: row.designation, active: row.active === 1, pendingTasks: Number(row.pending) }));
}

// Inactive, never deleted. Their sessions end at once. Anything still
// pending with them blocks and IT is told (G-02), so put the real people in
// the groups and HOD slots first.
export async function retireDemoStaff(actor: Actor & { sessionId?: string }): Promise<{ retired: number; pendingTasks: number }> {
  if (!isSuperAdmin(actor)) throw new Error("FORBIDDEN");
  return withTransaction(async (db) => {
    const people = (await listDemoPeople(db)).filter((person) => person.active);
    for (const person of people) {
      await db.query("UPDATE users SET active = FALSE, updated_by = ? WHERE id = ? AND is_demo = TRUE", [actor.id, person.id]);
      await revokeAllSessionsForUser(person.id, "DEMO_RETIRED", db);
    }
    const pendingTasks = people.reduce((sum, person) => sum + person.pendingTasks, 0);
    await recordAudit({ actorUserId: actor.id, action: "DEMO_STAFF_RETIRED", entityType: "SYSTEM", entityId: "demo", sessionId: actor.sessionId ?? null, metadata: { retired: people.length, pendingTasks } }, db);
    return { retired: people.length, pendingTasks };
  });
}

// "Try as" (D-071): the Super Admin continues as an active demo person to
// walk a request through. Only demo people, and only with the USER role;
// the Super Admin's own session ends (sign in again to return).
export async function startDemoSession(
  targetId: number,
  actor: Actor & { sessionId: string; ipAddress: string | null; userAgent: string | null },
): Promise<{ ok: true; token: string; name: string } | { ok: false; message: string }> {
  if (!isSuperAdmin(actor)) return { ok: false, message: "Not found." };
  const target = await findUserById(targetId);
  if (!target || !target.isDemo) return { ok: false, message: "Only demo people can be tried." };
  if (!target.active) return { ok: false, message: "This demo person is retired." };
  if (target.roles.some((role) => role !== "USER")) return { ok: false, message: "This demo person has admin rights, so it can't be tried. Remove them first." };
  const sessionId = randomUUID();
  await withTransaction(async (db) => {
    await createSession({ id: sessionId, userId: target.id, deviceId: null, authMethod: "DEMO", ipAddress: actor.ipAddress, userAgent: actor.userAgent, ttlSeconds: SESSION_TTL_SECONDS }, db);
    await revokeSession(actor.sessionId, "SWITCHED_TO_DEMO", db);
    await recordAudit({ actorUserId: actor.id, action: "DEMO_TRY_AS", entityType: "USER", entityId: target.id, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { demoSessionId: sessionId } }, db);
  });
  return { ok: true, token: createSessionToken(sessionId, target.id), name: target.name };
}
