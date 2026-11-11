import { z } from "zod";
import { parseCsv, unguardCell } from "@/server/import/csv";
import { IMPORT_LIMITS, IMPORT_SPECS, type ImportKind } from "@/server/import/kinds";
import { checkCanEdit, checkContactChange, checkModuleChange, checkRoleChange, isValidWhatsAppNumber, normaliseRoles, normaliseWhatsAppNumber, ASSIGNABLE_ROLES } from "@/server/admin/user-rules";
import { DEFAULT_MODULES, MODULES, modulesProblem, normaliseModules, sameModules, type ModuleCode } from "@/server/modules/modules";
import { allowsGoogle, allowsPassword, type RoleCode, type SignInMethod } from "@/types/auth";

// Bulk import planner (S10-03, F-59). Pure: given the file and a snapshot
// of what is in the database, it decides for every row whether it creates,
// changes or leaves a record alone, lists every problem by row and column,
// and returns the writes for the service to run in one transaction. The
// rules are the same as the admin forms (D-025, D-047).
export interface SnapshotUser {
  id: number;
  loginId: string;
  name: string;
  email: string;
  whatsappNumber: string | null;
  departmentId: number | null;
  designationId: number | null;
  reportingManagerId: number | null;
  signInMethod: SignInMethod;
  roles: RoleCode[];
  active: boolean;
  isBreakGlass: boolean;
  isDemo: boolean;
  approver: boolean; // designation ticked as Approver (D-085)
  googleLinked: boolean;
  hasPassword: boolean;
  modules: ModuleCode[]; // D-168 module access
}

export interface Snapshot {
  actor: { id: number; roles: readonly RoleCode[] };
  users: SnapshotUser[];
  departments: { id: number; code: string; name: string; hodUserId: number | null; active: boolean }[];
  designations: { id: number; code: string; name: string; isApprover: boolean; active: boolean }[];
  groups: { id: number; code: string; name: string; active: boolean; memberIds: number[] }[];
  holidays: { date: string; name: string }[];
}

export type RowAction = "create" | "update" | "unchanged" | "error";

export interface RowProblem {
  column: string;
  message: string;
}

export interface PlannedRow {
  line: number;
  key: string;
  action: RowAction;
  changes: string[];
  problems: RowProblem[];
}

export interface UserValue {
  loginId: string;
  name: string;
  email: string;
  whatsappNumber: string | null;
  departmentId: number | null;
  designationId: number | null;
  signInMethod: SignInMethod;
}

// A manager is an existing person (id) or a row of this file (loginId).
export type ManagerRef = { id: number } | { loginId: string } | null;

export type ImportOp =
  | { kind: "user-create"; line: number; value: UserValue; manager: ManagerRef; roles: RoleCode[]; modules: ModuleCode[] }
  | {
      kind: "user-update";
      line: number;
      id: number;
      value: UserValue;
      manager: ManagerRef;
      roles: RoleCode[];
      rolesChanged: boolean;
      /** v1.49.2: the new module access, or null to keep it. */
      modules: ModuleCode[] | null;
      changes: Record<string, { before: unknown; after: unknown }>;
      effects: { unlinkGoogle: boolean; clearPassword: boolean };
      endSessions: boolean;
    }
  | { kind: "department"; line: number; id: number | null; value: { code: string; name: string; hodUserId: number | null; active: boolean }; before: unknown }
  | { kind: "designation"; line: number; id: number | null; value: { code: string; name: string; isApprover: boolean; active: boolean }; before: unknown }
  | { kind: "group"; line: number; id: number | null; value: { code: string; name: string; active: boolean }; memberIds: number[]; before: unknown }
  | { kind: "holiday"; line: number; exists: boolean; value: { date: string; name: string }; before: unknown };

export interface ImportPlan {
  kind: ImportKind;
  fileProblems: string[];
  rows: PlannedRow[];
  ops: ImportOp[];
  summary: { total: number; create: number; update: number; unchanged: number; error: number };
}

const lower = (value: string) => value.trim().toLowerCase();
const CODE = /^[A-Za-z0-9_-]{2,50}$/;
const LOGIN_ID = /^[A-Za-z0-9._-]{2,100}$/;
const emailSchema = z.string().email();

export function parseYesNo(raw: string): boolean | null {
  const value = lower(raw);
  if (["", "yes", "y", "true", "1", "active"].includes(value)) return true;
  if (["no", "n", "false", "0", "inactive"].includes(value)) return false;
  return null;
}

// YYYY-MM-DD, or the Indian DD-MM-YYYY / DD/MM/YYYY. Returns YYYY-MM-DD.
export function parseDate(raw: string): string | null {
  const value = raw.trim();
  let year: number, month: number, day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else {
    match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value);
    if (!match) return null;
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function splitList(raw: string): string[] {
  return raw
    .split(/[;,|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// v1.49.2 (owner: "give module access while uploading users"): "APPROVAL;TASK",
// "all", empty (null: the default for new people, unchanged for existing).
function parseModules(raw: string): { modules: ModuleCode[] | null; unknown: string[] } {
  const items = raw.split(/[;,]/).map((item) => item.trim().toUpperCase()).filter(Boolean);
  if (!items.length) return { modules: null, unknown: [] };
  if (items.includes("ALL")) return { modules: [...MODULES], unknown: items.filter((item) => item !== "ALL" && !(MODULES as readonly string[]).includes(item)) };
  const result = normaliseModules(items);
  return result.ok ? { modules: result.value, unknown: [] } : { modules: null, unknown: result.invalid };
}

function parseRoles(raw: string): { roles: RoleCode[]; unknown: string[] } {
  const items = splitList(raw).map((item) => item.toUpperCase().replace(/[\s-]+/g, "_"));
  const unknown = items.filter((item) => !(ASSIGNABLE_ROLES as readonly string[]).includes(item));
  return { roles: normaliseRoles(items), unknown };
}

function parseSignIn(raw: string): SignInMethod | null {
  const value = lower(raw);
  if (value === "" || value === "google") return "GOOGLE";
  if (value === "password") return "PASSWORD";
  if (value === "both") return "BOTH";
  return null;
}

function diff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { before: unknown; after: unknown }> {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) out[key] = { before: before[key] ?? null, after: after[key] ?? null };
  }
  return out;
}

interface Row {
  line: number;
  get: (column: string) => string;
}

// Header and size checks shared by every kind.
function readFile(kind: ImportKind, text: string): { rows: Row[]; problems: string[] } {
  const spec = IMPORT_SPECS[kind];
  const { header, rows } = parseCsv(text);
  const problems: string[] = [];
  if (header.length === 0) return { rows: [], problems: ["The file is empty. Download the template and fill it in."] };
  const expected = spec.columns.map((column) => column.name);
  const missing = spec.columns.filter((column) => !column.optional && !header.includes(column.name)).map((column) => column.name);
  const unknown = header.filter((name) => name !== "" && !expected.includes(name));
  if (missing.length) problems.push(`Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Use the ${spec.label} template; keep every column, even if empty.`);
  if (unknown.length) problems.push(`Unknown column${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Is this the ${spec.label} file?`);
  const duplicates = header.filter((name, index) => name !== "" && header.indexOf(name) !== index);
  if (duplicates.length) problems.push(`Column repeated: ${[...new Set(duplicates)].join(", ")}.`);
  if (rows.length === 0) problems.push("The file has a header but no rows.");
  if (rows.length > IMPORT_LIMITS.maxRows) problems.push(`The file has ${rows.length} rows; the most in one import is ${IMPORT_LIMITS.maxRows}. Split it into smaller files.`);
  if (problems.length) return { rows: [], problems };
  const index = new Map(header.map((name, position) => [name, position]));
  return {
    rows: rows.map(({ line, cells }) => ({ line, get: (column: string) => unguardCell((cells[index.get(column) ?? -1] ?? "").trim()) })),
    problems,
  };
}

class RowCheck {
  problems: RowProblem[] = [];
  add(column: string, message: string) {
    this.problems.push({ column, message });
  }
  required(row: Row, column: string, label: string): string {
    const value = row.get(column);
    if (!value) this.add(column, `${label} is required.`);
    return value;
  }
}

function duplicatesIn(rows: Row[], keyOf: (row: Row) => string): Set<string> {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, count]) => count > 1).map(([key]) => key));
}

function finish(kind: ImportKind, fileProblems: string[], rows: PlannedRow[], ops: ImportOp[]): ImportPlan {
  const count = (action: RowAction) => rows.filter((row) => row.action === action).length;
  const hasErrors = fileProblems.length > 0 || rows.some((row) => row.action === "error");
  return {
    kind,
    fileProblems,
    rows,
    // Nothing is written unless every row is fine (all or nothing).
    ops: hasErrors ? [] : ops,
    summary: { total: rows.length, create: count("create"), update: count("update"), unchanged: count("unchanged"), error: count("error") },
  };
}

function planned(line: number, key: string, check: RowCheck, isNew: boolean, changes: string[]): PlannedRow {
  if (check.problems.length) return { line, key, action: "error", changes: [], problems: check.problems };
  return { line, key, action: isNew ? "create" : changes.length ? "update" : "unchanged", changes, problems: [] };
}

function planCodeName(row: Row, check: RowCheck, duplicateCodes: Set<string>): { code: string; name: string; active: boolean } {
  const rawCode = check.required(row, "code", "Code");
  if (rawCode && !CODE.test(rawCode)) check.add("code", "Use 2–50 letters, numbers, dash or underscore.");
  const code = rawCode.toUpperCase();
  if (code && duplicateCodes.has(code)) check.add("code", "This code appears more than once in the file.");
  const name = check.required(row, "name", "Name");
  if (name && (name.length < 2 || name.length > 150)) check.add("name", "Use 2–150 characters.");
  const active = parseYesNo(row.get("active"));
  if (active === null) check.add("active", "Write Yes or No.");
  return { code, name, active: active ?? true };
}

function planUsers(rows: Row[], snapshot: Snapshot): { planned: PlannedRow[]; ops: ImportOp[] } {
  const byLogin = new Map(snapshot.users.map((user) => [lower(user.loginId), user]));
  const byEmail = new Map(snapshot.users.map((user) => [lower(user.email), user]));
  const byWhatsApp = new Map(snapshot.users.filter((user) => user.whatsappNumber).map((user) => [user.whatsappNumber!, user]));
  const departments = new Map(snapshot.departments.map((item) => [item.code.toUpperCase(), item]));
  const designations = new Map(snapshot.designations.map((item) => [item.code.toUpperCase(), item]));
  const superAdmins = snapshot.users.filter((user) => user.active && !user.isBreakGlass && user.roles.includes("SUPER_ADMIN")).length;
  const fileLogins = new Set(rows.map((row) => lower(row.get("login_id"))).filter(Boolean));
  const dupLogin = duplicatesIn(rows, (row) => lower(row.get("login_id")));
  const dupEmail = duplicatesIn(rows, (row) => lower(row.get("email")));
  const dupWhatsApp = duplicatesIn(rows, (row) => normaliseWhatsAppNumber(row.get("whatsapp_number")) ?? "");

  // Reporting lines after the import: the database overlaid with the file.
  const loginOfId = new Map(snapshot.users.map((user) => [user.id, lower(user.loginId)]));
  const managerOf = new Map<string, string | null>(
    snapshot.users.map((user) => [lower(user.loginId), user.reportingManagerId ? (loginOfId.get(user.reportingManagerId) ?? null) : null]),
  );
  for (const row of rows) {
    const login = lower(row.get("login_id"));
    if (login) managerOf.set(login, lower(row.get("manager_login_id")) || null);
  }
  const loops = (login: string): boolean => {
    const seen = new Set<string>();
    let current = managerOf.get(login) ?? null;
    while (current) {
      if (current === login) return true;
      if (seen.has(current)) return false;
      seen.add(current);
      current = managerOf.get(current) ?? null;
    }
    return false;
  };

  const plannedRows: PlannedRow[] = [];
  const ops: ImportOp[] = [];
  for (const row of rows) {
    const check = new RowCheck();
    const loginId = check.required(row, "login_id", "User ID");
    const login = lower(loginId);
    if (loginId && !LOGIN_ID.test(loginId)) check.add("login_id", "Use 2–100 letters, numbers, dot, dash or underscore.");
    else if (loginId && /^\d{10,15}$/.test(loginId)) check.add("login_id", "A User ID can't be 10 to 15 digits (it would look like a mobile number).");
    if (login && dupLogin.has(login)) check.add("login_id", "This User ID appears more than once in the file.");
    const existing = login ? byLogin.get(login) : undefined;
    if (existing?.isBreakGlass) check.add("login_id", "The break-glass account can't be changed by import.");
    if (existing?.isDemo) check.add("login_id", "This is a demo person; manage it in Super Admin → Demo data.");

    const name = check.required(row, "name", "Name");
    if (name && (name.length < 2 || name.length > 200)) check.add("name", "Use 2–200 characters.");
    const email = lower(check.required(row, "email", "Email"));
    if (email && (!emailSchema.safeParse(email).success || email.length > 255)) check.add("email", "Enter a valid email address.");
    else if (email) {
      if (dupEmail.has(email)) check.add("email", "This email appears more than once in the file.");
      const owner = byEmail.get(email);
      if (owner && owner.id !== existing?.id) check.add("email", `Already used by ${owner.name} (${owner.loginId}).`);
    }

    const whatsappNumber = normaliseWhatsAppNumber(row.get("whatsapp_number"));
    if (whatsappNumber !== null) {
      if (!isValidWhatsAppNumber(whatsappNumber)) check.add("whatsapp_number", "Enter a mobile number with country code, e.g. 919876543210.");
      else {
        if (dupWhatsApp.has(whatsappNumber)) check.add("whatsapp_number", "This number appears more than once in the file.");
        const owner = byWhatsApp.get(whatsappNumber);
        if (owner && owner.id !== existing?.id) check.add("whatsapp_number", `Already used by ${owner.name} (${owner.loginId}).`);
      }
    }

    // An inactive department, designation or manager is accepted only when
    // it is what the person already has (a re-uploaded export stays valid).
    const departmentCode = row.get("department_code").toUpperCase();
    const department = departmentCode ? departments.get(departmentCode) : undefined;
    if (departmentCode && (!department || (!department.active && department.id !== existing?.departmentId))) check.add("department_code", `No active department with code ${departmentCode}.`);
    const designationCode = row.get("designation_code").toUpperCase();
    const designation = designationCode ? designations.get(designationCode) : undefined;
    if (designationCode && (!designation || (!designation.active && designation.id !== existing?.designationId))) check.add("designation_code", `No active designation with code ${designationCode}.`);

    const managerLogin = lower(row.get("manager_login_id"));
    let manager: ManagerRef = null;
    if (managerLogin) {
      const managerUser = byLogin.get(managerLogin);
      if (managerLogin === login) check.add("manager_login_id", "A person can't report to themselves.");
      else if (managerUser && !managerUser.isBreakGlass && (managerUser.active || managerUser.id === existing?.reportingManagerId)) manager = { id: managerUser.id };
      else if (fileLogins.has(managerLogin) && !managerUser) manager = { loginId: managerLogin };
      else check.add("manager_login_id", `No active person with User ID ${row.get("manager_login_id")}.`);
      if (login && managerLogin !== login && loops(login)) check.add("manager_login_id", "This would make the reporting line loop back to this person.");
      // D-085: a newly chosen manager must be an approver. A manager who is
      // new in this file can't be checked yet, so their designation must be.
      const managerRow = rows.find((other) => lower(other.get("login_id")) === managerLogin);
      const managerIsApprover = managerUser
        ? managerUser.approver
        : Boolean(managerRow && designations.get(managerRow.get("designation_code").toUpperCase())?.isApprover);
      const unchanged = Boolean(existing && managerUser && existing.reportingManagerId === managerUser.id);
      if (manager && !managerIsApprover && !unchanged) check.add("manager_login_id", `${row.get("manager_login_id")} isn't an approver: their designation isn't ticked as Approver.`);
    }

    const signInMethod = parseSignIn(row.get("sign_in_method"));
    if (!signInMethod) check.add("sign_in_method", "Write GOOGLE, PASSWORD or BOTH.");
    if (signInMethod && allowsPassword(signInMethod) && whatsappNumber === null) check.add("whatsapp_number", "Password sign-in needs a WhatsApp number for the sign-in code.");
    const { roles, unknown } = parseRoles(row.get("roles"));
    if (unknown.length) check.add("roles", `Unknown role${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Use USER, EXPORTER, IT_ADMIN or SUPER_ADMIN.`);

    const { modules, unknown: unknownModules } = parseModules(row.get("modules"));
    if (unknownModules.length) check.add("modules", `Unknown module${unknownModules.length === 1 ? "" : "s"}: ${unknownModules.join(", ")}. Use APPROVAL, TASK, PROJECT, INFORMATION, MEETING, AI or ALL, separated by ;.`);
    else if (modules && modulesProblem(modules)) check.add("modules", modulesProblem(modules)!);

    const value: UserValue = {
      loginId,
      name,
      email,
      whatsappNumber,
      departmentId: department?.id ?? null,
      designationId: designation?.id ?? null,
      signInMethod: signInMethod ?? "GOOGLE",
    };
    const managerLoginAfter = manager === null ? null : "id" in manager ? (loginOfId.get(manager.id) ?? null) : manager.loginId;

    if (!existing) {
      const roleCheck = checkRoleChange(snapshot.actor, null, roles, superAdmins);
      if (!roleCheck.ok) check.add("roles", roleCheck.message);
      plannedRows.push(planned(row.line, loginId, check, true, []));
      if (!check.problems.length) ops.push({ kind: "user-create", line: row.line, value, manager, roles, modules: modules ?? [...DEFAULT_MODULES] });
      continue;
    }

    const before = {
      loginId: existing.loginId,
      name: existing.name,
      email: lower(existing.email),
      whatsappNumber: existing.whatsappNumber,
      departmentId: existing.departmentId,
      designationId: existing.designationId,
      signInMethod: existing.signInMethod,
      manager: existing.reportingManagerId ? (loginOfId.get(existing.reportingManagerId) ?? null) : null,
    };
    // The User ID is the match key; its spelling (case) is kept as it is.
    const after = { ...value, loginId: existing.loginId, manager: managerLoginAfter };
    const changes = diff(before, after);
    const rolesChanged = [...existing.roles].sort().join(",") !== [...roles].sort().join(",");
    const modulesChanged = modules !== null && !sameModules(existing.modules, modules);
    if (modulesChanged) {
      // The user page's rule (D-168): not your own, and another IT Admin's only by the Super Admin.
      const moduleCheck = checkModuleChange(snapshot.actor, { id: existing.id, roles: existing.roles, active: existing.active, isBreakGlass: existing.isBreakGlass });
      if (!moduleCheck.ok) check.add("modules", moduleCheck.message);
    }
    if (Object.keys(changes).length || rolesChanged) {
      const target = { id: existing.id, roles: existing.roles, active: existing.active, isBreakGlass: existing.isBreakGlass };
      const edit = checkCanEdit(snapshot.actor, target);
      if (!edit.ok) check.add("login_id", edit.message);
      else {
        const roleCheck = checkRoleChange(snapshot.actor, target, roles, superAdmins);
        if (!roleCheck.ok) check.add("roles", roleCheck.message);
        // AUD-01 (v1.10.0): the same contact rule as the user form (audit P-04),
        // so an IT Admin can't change another IT Admin's email, WhatsApp
        // number or sign-in method through a CSV import.
        const contact = checkContactChange(snapshot.actor, target, { email: Boolean(changes.email), whatsappNumber: Boolean(changes.whatsappNumber), signInMethod: Boolean(changes.signInMethod) });
        if (!contact.ok) check.add(changes.email ? "email" : changes.whatsappNumber ? "whatsapp_number" : "sign_in_method", contact.message);
      }
    }
    const changeNames = [...Object.keys(changes), ...(rolesChanged ? ["roles"] : []), ...(modulesChanged ? ["modules"] : [])];
    plannedRows.push(planned(row.line, existing.loginId, check, false, changeNames));
    if (!check.problems.length && changeNames.length) {
      const emailChanged = Boolean(changes.email);
      const methodChanged = Boolean(changes.signInMethod);
      ops.push({
        kind: "user-update",
        line: row.line,
        id: existing.id,
        value: { ...value, loginId: existing.loginId },
        manager,
        roles,
        rolesChanged,
        modules: modulesChanged ? modules : null,
        changes,
        effects: {
          unlinkGoogle: existing.googleLinked && (emailChanged || !allowsGoogle(value.signInMethod)),
          clearPassword: !allowsPassword(value.signInMethod) && existing.hasPassword,
        },
        endSessions: emailChanged || methodChanged,
      });
    }
  }
  return { planned: plannedRows, ops };
}

function planOrganisation(kind: "departments" | "designations", rows: Row[], snapshot: Snapshot): { planned: PlannedRow[]; ops: ImportOp[] } {
  const list = kind === "departments" ? snapshot.departments : snapshot.designations;
  const byCode = new Map(list.map((item) => [item.code.toUpperCase(), item]));
  const usersByLogin = new Map(snapshot.users.map((user) => [lower(user.loginId), user]));
  const dupCodes = duplicatesIn(rows, (row) => row.get("code").toUpperCase());
  const plannedRows: PlannedRow[] = [];
  const ops: ImportOp[] = [];
  for (const row of rows) {
    const check = new RowCheck();
    const { code, name, active } = planCodeName(row, check, dupCodes);
    const existing = code ? byCode.get(code) : undefined;
    if (kind === "departments") {
      const hodLogin = lower(row.get("hod_login_id"));
      const hod = hodLogin ? usersByLogin.get(hodLogin) : undefined;
      const currentHod = existing ? (existing as Snapshot["departments"][number]).hodUserId : null;
      if (hodLogin && (!hod || hod.isBreakGlass || (!hod.active && hod.id !== currentHod))) check.add("hod_login_id", `No active person with User ID ${row.get("hod_login_id")}.`);
      else if (hod && !hod.approver && hod.id !== currentHod) check.add("hod_login_id", `${row.get("hod_login_id")} isn't an approver: their designation isn't ticked as Approver.`);
      const value = { code, name, hodUserId: hod?.id ?? null, active };
      const before = existing ? { code: existing.code, name: existing.name, hodUserId: (existing as Snapshot["departments"][number]).hodUserId, active: existing.active } : null;
      const changes = before ? Object.keys(diff(before, value)) : [];
      plannedRows.push(planned(row.line, code, check, !existing, changes));
      if (!check.problems.length && (!existing || changes.length)) ops.push({ kind: "department", line: row.line, id: existing?.id ?? null, value, before });
    } else {
      const approver = parseYesNo(row.get("approver") || "no");
      if (approver === null) check.add("approver", "Write Yes or No.");
      const value = { code, name, isApprover: approver ?? false, active };
      const current = existing as Snapshot["designations"][number] | undefined;
      const before = current ? { code: current.code, name: current.name, isApprover: current.isApprover, active: current.active } : null;
      const changes = before ? Object.keys(diff(before, value)) : [];
      plannedRows.push(planned(row.line, code, check, !existing, changes));
      if (!check.problems.length && (!existing || changes.length)) ops.push({ kind: "designation", line: row.line, id: existing?.id ?? null, value, before });
    }
  }
  return { planned: plannedRows, ops };
}

function planGroups(rows: Row[], snapshot: Snapshot): { planned: PlannedRow[]; ops: ImportOp[] } {
  const byCode = new Map(snapshot.groups.map((item) => [item.code.toUpperCase(), item]));
  const usersByLogin = new Map(snapshot.users.map((user) => [lower(user.loginId), user]));
  const dupCodes = duplicatesIn(rows, (row) => row.get("code").toUpperCase());
  const plannedRows: PlannedRow[] = [];
  const ops: ImportOp[] = [];
  for (const row of rows) {
    const check = new RowCheck();
    const { code, name, active } = planCodeName(row, check, dupCodes);
    const current = byCode.get(code)?.memberIds ?? [];
    const memberIds: number[] = [];
    const missing: string[] = [];
    const notApprovers: string[] = [];
    for (const member of splitList(row.get("members"))) {
      const user = usersByLogin.get(lower(member));
      if (!user || user.isBreakGlass || (!user.active && !current.includes(user.id))) missing.push(member);
      else if (!user.approver && !current.includes(user.id)) notApprovers.push(member);
      else if (!memberIds.includes(user.id)) memberIds.push(user.id);
    }
    if (missing.length) check.add("members", `No active person with User ID ${missing.join(", ")}.`);
    if (notApprovers.length) check.add("members", `Not approvers (designation not ticked as Approver): ${notApprovers.join(", ")}.`);
    memberIds.sort((a, b) => a - b);
    const existing = code ? byCode.get(code) : undefined;
    const value = { code, name, active };
    const before = existing ? { code: existing.code, name: existing.name, active: existing.active, members: [...existing.memberIds].sort((a, b) => a - b) } : null;
    const changes = before ? Object.keys(diff(before, { ...value, members: memberIds })) : [];
    plannedRows.push(planned(row.line, code, check, !existing, changes));
    if (!check.problems.length && (!existing || changes.length)) ops.push({ kind: "group", line: row.line, id: existing?.id ?? null, value, memberIds, before });
  }
  return { planned: plannedRows, ops };
}

function planHolidays(rows: Row[], snapshot: Snapshot): { planned: PlannedRow[]; ops: ImportOp[] } {
  const byDate = new Map(snapshot.holidays.map((item) => [item.date, item]));
  const dupDates = duplicatesIn(rows, (row) => parseDate(row.get("date")) ?? "");
  const plannedRows: PlannedRow[] = [];
  const ops: ImportOp[] = [];
  for (const row of rows) {
    const check = new RowCheck();
    const raw = check.required(row, "date", "Date");
    const date = raw ? parseDate(raw) : null;
    if (raw && !date) check.add("date", "Write the date as YYYY-MM-DD or DD-MM-YYYY.");
    if (date && dupDates.has(date)) check.add("date", "This date appears more than once in the file.");
    const name = check.required(row, "name", "Name");
    if (name.length > 100) check.add("name", "Use at most 100 characters.");
    const existing = date ? byDate.get(date) : undefined;
    const changes = existing && existing.name !== name ? ["name"] : [];
    plannedRows.push(planned(row.line, date ?? raw, check, !existing, changes));
    if (!check.problems.length && date && (!existing || changes.length)) ops.push({ kind: "holiday", line: row.line, exists: Boolean(existing), value: { date, name }, before: existing ?? null });
  }
  return { planned: plannedRows, ops };
}

export function planImport(kind: ImportKind, text: string, snapshot: Snapshot): ImportPlan {
  const { rows, problems } = readFile(kind, text);
  if (problems.length) return finish(kind, problems, [], []);
  const result =
    kind === "users"
      ? planUsers(rows, snapshot)
      : kind === "groups"
        ? planGroups(rows, snapshot)
        : kind === "holidays"
          ? planHolidays(rows, snapshot)
          : planOrganisation(kind, rows, snapshot);
  return finish(kind, [], result.planned, result.ops);
}
