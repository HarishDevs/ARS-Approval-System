import { describe, expect, it } from "vitest";
import { guardCell, parseCsv, toCsv, unguardCell } from "@/server/import/csv";
import { parseDate, parseYesNo, planImport, type Snapshot, type SnapshotUser } from "@/server/import/plan";
import { IMPORT_KINDS, IMPORT_SPECS } from "@/server/import/kinds";

// Bulk import (S10, F-59): the CSV reader/writer and the planner's rules.
describe("CSV", () => {
  it("reads what Excel writes: BOM, CRLF, quotes, embedded commas and line breaks, blank lines", () => {
    const text = '﻿code,name\r\nFIN,"Finance, Accounts"\r\n\r\nHR,"Human ""People""\r\nResources"\r\n';
    const parsed = parseCsv(text);
    expect(parsed.header).toEqual(["code", "name"]);
    expect(parsed.rows).toEqual([
      { line: 2, cells: ["FIN", "Finance, Accounts"] },
      { line: 4, cells: ["HR", 'Human "People"\nResources'] },
    ]);
  });

  it("reads semicolon files (some regional Excel settings)", () => {
    expect(parseCsv("Code;Name\nFIN;Finance").rows[0]!.cells).toEqual(["FIN", "Finance"]);
  });

  // v1.49.1 (owner's files): Excel's "Text (Tab delimited)" saved with a .csv name.
  it("reads tab-separated files, and a comma inside a tab file stays in its cell", () => {
    const parsed = parseCsv("code\tname\thod_login_id\tactive\r\nHA\tHR, Admin\t5518\tYes\r\n");
    expect(parsed.header).toEqual(["code", "name", "hod_login_id", "active"]);
    expect(parsed.rows[0]!.cells).toEqual(["HA", "HR, Admin", "5518", "Yes"]);
  });

  it("writes a BOM and quotes, and guards formula-looking cells both ways", () => {
    const csv = toCsv(["a", "b"], [["=1+1", 'say "hi", ok']]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`'=1+1,"say ""hi"", ok"`);
    expect(guardCell("+919876543210")).toBe("'+919876543210");
    expect(unguardCell("'+919876543210")).toBe("+919876543210");
    expect(unguardCell("'plain")).toBe("'plain");
    // A written file reads back to the same values.
    const back = parseCsv(csv).rows[0]!.cells.map(unguardCell);
    expect(back).toEqual(["=1+1", 'say "hi", ok']);
  });
});

describe("value parsing", () => {
  it("dates: ISO and Indian day-first; impossible dates refused", () => {
    expect(parseDate("2026-10-20")).toBe("2026-10-20");
    expect(parseDate("20/10/2026")).toBe("2026-10-20");
    expect(parseDate("5-1-2027")).toBe("2027-01-05");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("10/20/2026")).toBeNull();
    expect(parseDate("tomorrow")).toBeNull();
  });
  it("yes/no with empty meaning yes", () => {
    expect(parseYesNo("")).toBe(true);
    expect(parseYesNo("No")).toBe(false);
    expect(parseYesNo("maybe")).toBeNull();
  });
});

const user = (over: Partial<SnapshotUser>): SnapshotUser => ({
  id: 1,
  loginId: "itadmin",
  name: "IT Admin",
  email: "it@example.com",
  whatsappNumber: null,
  departmentId: null,
  designationId: null,
  reportingManagerId: null,
  signInMethod: "GOOGLE",
  roles: ["USER"],
  active: true,
  isBreakGlass: false,
  isDemo: false,
  approver: true,
  googleLinked: false,
  hasPassword: false,
  modules: ["APPROVAL", "TASK", "INFORMATION"],
  ...over,
});

function snapshot(actorRoles: Snapshot["actor"]["roles"] = ["USER", "IT_ADMIN"]): Snapshot {
  return {
    actor: { id: 2, roles: actorRoles },
    users: [
      user({ id: 1, loginId: "boss", name: "Big Boss", email: "boss@example.com", roles: ["USER", "SUPER_ADMIN"] }),
      user({ id: 2, loginId: "elena", name: "Elena Admin", email: "elena@example.com", roles: ["USER", "IT_ADMIN"], whatsappNumber: "919000000002" }),
      user({ id: 3, loginId: "ravi", name: "Ravi Kumar", email: "ravi@example.com", reportingManagerId: 4, departmentId: 10 }),
      user({ id: 4, loginId: "oldmgr", name: "Old Manager", email: "old@example.com", active: false }),
      user({ id: 5, loginId: "breakglass", name: "Break Glass", email: "bg@example.com", isBreakGlass: true }),
    ],
    departments: [
      { id: 10, code: "FIN", name: "Finance", hodUserId: null, active: true },
      { id: 11, code: "OLD", name: "Old dept", hodUserId: null, active: false },
    ],
    designations: [
      { id: 20, code: "MGR", name: "Manager", isApprover: true, active: true },
      { id: 21, code: "EXEC", name: "Executive", isApprover: false, active: true },
    ],
    groups: [{ id: 30, code: "FIN_CHECKERS", name: "Finance checkers", active: true, memberIds: [2, 3] }],
    holidays: [{ date: "2026-10-20", name: "Deepavali" }],
  };
}

// The users file as it was before the optional modules column (v1.49.2): it still works.
const USERS_HEADER = IMPORT_SPECS.users.columns.filter((column) => !column.optional).map((column) => column.name).join(",");
const WITH_MODULES = "login_id,name,email,whatsapp_number,department_code,designation_code,manager_login_id,sign_in_method,modules,roles";
const usersFile = (...rows: string[]) => [USERS_HEADER, ...rows].join("\n");

describe("planImport: file checks", () => {
  it("every kind's template has its required columns first and reads back as an empty file", () => {
    for (const kind of IMPORT_KINDS) {
      const plan = planImport(kind, IMPORT_SPECS[kind].columns.map((column) => column.name).join(","), snapshot());
      expect(plan.fileProblems).toEqual(["The file has a header but no rows."]);
      expect(IMPORT_SPECS[kind].columns[0]!.required).toBe(true);
    }
  });

  it("missing or unknown columns stop the whole file", () => {
    const plan = planImport("users", "login_id,name,emial\nx,y,z", snapshot());
    expect(plan.fileProblems.join(" ")).toMatch(/Missing columns: email/);
    expect(plan.fileProblems.join(" ")).toMatch(/Unknown column: emial/);
    expect(plan.ops).toEqual([]);
  });
});

describe("planImport: users' module access (v1.49.2)", () => {
  it("sets modules for new people (ALL, a list, or the default when empty) and refuses unknown ones", () => {
    const plan = planImport(
      "users",
      [
        WITH_MODULES,
        "new1,New One,new1@example.com,,,,,GOOGLE,ALL,USER",
        "new2,New Two,new2@example.com,,,,,GOOGLE,approval; ai,USER",
        "new3,New Three,new3@example.com,,,,,GOOGLE,,USER",
      ].join("\n"),
      snapshot(),
    );
    const created = plan.ops.filter((op) => op.kind === "user-create");
    expect(created.map((op) => (op.kind === "user-create" ? op.modules : null))).toEqual([
      ["APPROVAL", "TASK", "INFORMATION", "AI"],
      ["APPROVAL", "AI"],
      ["APPROVAL", "TASK", "INFORMATION"],
    ]);
    const bad = planImport("users", [WITH_MODULES, "new4,New Four,new4@example.com,,,,,GOOGLE,TASK;CRM,USER"].join("\n"), snapshot());
    expect(bad.rows[0]!.problems[0]).toMatchObject({ column: "modules", message: expect.stringMatching(/Unknown module: CRM/) });
  });

  it("changes an existing person's modules only when the cell is filled, by the user page's rules", () => {
    const keep = planImport("users", [WITH_MODULES, "ravi,Ravi Kumar,ravi@example.com,,FIN,,oldmgr,GOOGLE,,USER"].join("\n"), snapshot());
    expect(keep.summary.update).toBe(0);
    const change = planImport("users", [WITH_MODULES, "ravi,Ravi Kumar,ravi@example.com,,FIN,,oldmgr,GOOGLE,APPROVAL;TASK;INFORMATION;AI,USER"].join("\n"), snapshot());
    const op = change.ops[0];
    expect(op?.kind === "user-update" ? op.modules : null).toEqual(["APPROVAL", "TASK", "INFORMATION", "AI"]);
    expect(change.rows[0]!.changes).toContain("modules");
    // Not your own (the actor is elena), and another IT Admin's only by the Super Admin.
    const own = planImport("users", [WITH_MODULES, "elena,Elena Admin,elena@example.com,919000000002,,,,GOOGLE,ALL,USER;IT_ADMIN"].join("\n"), snapshot());
    expect(own.rows[0]!.problems[0]!.message).toMatch(/your own module access/);
  });
});

describe("planImport: users", () => {
  it("creates new people, leaves identical ones alone, and links a manager from the same file", () => {
    const plan = planImport(
      "users",
      usersFile(
        "ravi,Ravi Kumar,RAVI@example.com,,FIN,,oldmgr,GOOGLE,USER",
        "sita,Sita Raman,sita@example.com,9876543210,FIN,MGR,newboss,PASSWORD,",
        "newboss,New Boss,newboss@example.com,,,MGR,,,USER;IT_ADMIN",
      ),
      snapshot(),
    );
    expect(plan.summary).toEqual({ total: 3, create: 2, update: 0, unchanged: 1, error: 0 });
    const sita = plan.ops.find((op) => op.kind === "user-create" && op.value.loginId === "sita");
    expect(sita).toMatchObject({ manager: { loginId: "newboss" }, value: { whatsappNumber: "919876543210", departmentId: 10, designationId: 20, signInMethod: "PASSWORD" } });
  });

  it("an existing inactive manager is fine when unchanged, but can't be newly chosen", () => {
    const plan = planImport("users", usersFile("elena,Elena Admin,elena@example.com,919000000002,,,oldmgr,GOOGLE,USER;IT_ADMIN"), snapshot());
    expect(plan.rows[0]!.problems).toEqual([{ column: "manager_login_id", message: "No active person with User ID oldmgr." }]);
  });

  it("lists every problem by column, and writes nothing when any row is wrong", () => {
    const plan = planImport(
      "users",
      usersFile(
        "ok.person,Okay Person,ok@example.com,,,,,,",
        "bad id!,X,not-an-email,123,NOPE,,,PASSWORD,ROOT",
        "dup,Dup One,elena@example.com,919000000002,,,,,",
      ),
      snapshot(),
    );
    expect(plan.summary.error).toBe(2);
    expect(plan.ops).toEqual([]);
    const columns = plan.rows[1]!.problems.map((problem) => problem.column);
    expect(columns).toEqual(expect.arrayContaining(["login_id", "name", "email", "whatsapp_number", "department_code", "roles"]));
    expect(plan.rows[2]!.problems.map((problem) => problem.message)).toEqual(["Already used by Elena Admin (elena).", "Already used by Elena Admin (elena)."]);
  });

  it("refuses repeated keys, reporting loops and self-reporting", () => {
    const plan = planImport(
      "users",
      usersFile("a1,Person A,a@example.com,,,,b1,,", "b1,Person B,b@example.com,,,,a1,,", "c1,Person C,c@example.com,,,,c1,,", "c1,Person C2,c2@example.com,,,,,,"),
      snapshot(),
    );
    expect(plan.rows[0]!.problems[0]!.message).toMatch(/loop back/);
    expect(plan.rows[1]!.problems[0]!.message).toMatch(/loop back/);
    expect(plan.rows[2]!.problems.map((problem) => problem.message)).toContain("A person can't report to themselves.");
    expect(plan.rows[3]!.problems[0]!.message).toMatch(/more than once/);
  });

  it("follows the same role rules as the form: only a Super Admin grants Super Admin", () => {
    const row = "newsuper,New Super,ns@example.com,,,,,,USER;SUPER_ADMIN";
    expect(planImport("users", usersFile(row), snapshot()).rows[0]!.problems[0]!.message).toMatch(/Only the Super Admin/);
    expect(planImport("users", usersFile(row), snapshot(["USER", "SUPER_ADMIN"])).summary.create).toBe(1);
    // An IT Admin can't change a Super Admin's account at all.
    expect(planImport("users", usersFile("boss,Big Boss Renamed,boss@example.com,,,,,,USER;SUPER_ADMIN"), snapshot()).rows[0]!.problems[0]!.message).toMatch(/Only the Super Admin/);
  });

  it("AUD-01: an IT Admin can't change another IT Admin's email, WhatsApp or sign-in method by import", () => {
    const base = snapshot(["USER", "IT_ADMIN"]);
    base.actor = { id: 9, roles: ["USER", "IT_ADMIN"] }; // a different IT Admin
    const email = planImport("users", usersFile("elena,Elena Admin,elena.new@example.com,919000000002,,,,GOOGLE,USER;IT_ADMIN"), base);
    expect(email.rows[0]!.problems).toEqual([{ column: "email", message: expect.stringMatching(/Only the Super Admin can change another IT Admin/) }]);
    expect(email.ops).toEqual([]);
    const phone = planImport("users", usersFile("elena,Elena Admin,elena@example.com,919000000099,,,,GOOGLE,USER;IT_ADMIN"), base);
    expect(phone.rows[0]!.problems[0]!.column).toBe("whatsapp_number");
    // A name change is fine; so is the Super Admin; so is your own.
    expect(planImport("users", usersFile("elena,Elena A,elena@example.com,919000000002,,,,GOOGLE,USER;IT_ADMIN"), base).summary.update).toBe(1);
    expect(planImport("users", usersFile("elena,Elena Admin,elena.new@example.com,919000000002,,,,GOOGLE,USER;IT_ADMIN"), snapshot(["USER", "SUPER_ADMIN"])).summary.update).toBe(1);
    expect(planImport("users", usersFile("elena,Elena Admin,elena.new@example.com,919000000002,,,,GOOGLE,USER;IT_ADMIN"), snapshot()).summary.update).toBe(1);
  });

  it("never touches break-glass, and password sign-in needs WhatsApp", () => {
    const plan = planImport("users", usersFile("breakglass,Break Glass,bg@example.com,,,,,,", "pw,Pass Word,pw@example.com,,,,,PASSWORD,"), snapshot());
    expect(plan.rows[0]!.problems[0]!.message).toMatch(/break-glass/);
    expect(plan.rows[1]!.problems[0]!.message).toMatch(/needs a WhatsApp number/);
  });

  it("an email change ends sessions and unlinks Google, like the form", () => {
    const base = snapshot();
    base.users[2] = { ...base.users[2]!, googleLinked: true };
    const plan = planImport("users", usersFile("ravi,Ravi Kumar,ravi.k@example.com,,FIN,,oldmgr,GOOGLE,USER"), base);
    expect(plan.ops[0]).toMatchObject({ kind: "user-update", endSessions: true, effects: { unlinkGoogle: true, clearPassword: false } });
    expect(plan.rows[0]!.changes).toEqual(["email"]);
  });
});

describe("planImport: approver designations (D-085)", () => {
  it("a newly chosen manager, HOD or group member must be an approver; what is already saved stays valid", () => {
    const base = snapshot();
    base.users[2] = { ...base.users[2]!, approver: false }; // ravi
    base.users.push({ ...base.users[2]!, id: 6, loginId: "junior", name: "Junior Exec", email: "junior@example.com", departmentId: null, reportingManagerId: 3, approver: false });
    const users = planImport("users", usersFile("junior,Junior Exec,junior@example.com,,,,ravi,GOOGLE,USER", "newbie,New Bie,newbie@example.com,,,,ravi,,"), base);
    expect(users.rows[0]!.action).toBe("unchanged");
    expect(users.rows[1]!.problems[0]!.message).toMatch(/isn't an approver/);
    const inFile = planImport("users", usersFile("lead,Team Lead,lead@example.com,,,EXEC,,,", "member,Member,member@example.com,,,,lead,,"), base);
    expect(inFile.rows[1]!.problems[0]!.message).toMatch(/isn't an approver/);
    const hod = planImport("departments", "code,name,hod_login_id,active\nFIN,Finance,ravi,Yes", base);
    expect(hod.rows[0]!.problems[0]!.message).toMatch(/isn't an approver/);
    const group = planImport("groups", "code,name,members,active\nFIN_CHECKERS,Finance checkers,elena;ravi,Yes", base); // ravi already a member
    expect(group.rows[0]!.action).toBe("unchanged");
    const newGroup = planImport("groups", "code,name,members,active\nNEW_G,New group,ravi,Yes", base);
    expect(newGroup.rows[0]!.problems[0]!.message).toMatch(/Not approvers/);
  });

  it("designations carry the approver flag (empty means No)", () => {
    const plan = planImport("designations", "code,name,approver,active\nMGR,Manager,Yes,Yes\nEXEC,Executive,Yes,Yes\nTRAINEE,Trainee,,Yes\nX1,Bad,perhaps,Yes", snapshot());
    expect(plan.rows.map((row) => row.action)).toEqual(["unchanged", "update", "create", "error"]);
    expect(plan.rows[1]!.changes).toEqual(["isApprover"]);
  });
});

describe("planImport: masters", () => {
  it("departments: create, update by code (any case), HOD by User ID, Yes/No", () => {
    const plan = planImport("departments", "code,name,hod_login_id,active\nfin,Finance & Accounts,ravi,Yes\nHR,Human Resources,,No\nX,Bad,nobody,perhaps", snapshot());
    expect(plan.rows.map((row) => row.action)).toEqual(["update", "create", "error"]);
    expect(plan.rows[0]!.changes).toEqual(["name", "hodUserId"]);
    expect(plan.rows[2]!.problems.map((problem) => problem.column).sort()).toEqual(["active", "code", "hod_login_id"]);
  });

  it("groups: the members cell is the full list", () => {
    const plan = planImport("groups", "code,name,members,active\nFIN_CHECKERS,Finance checkers,elena,Yes\nNEW_DESK,New desk,ravi;elena;ghost,", snapshot());
    expect(plan.rows[0]).toMatchObject({ action: "update", changes: ["members"] });
    expect(plan.rows[1]!.problems[0]!.message).toBe("No active person with User ID ghost.");
  });

  it("holidays: day-first dates, rename by date, repeated dates refused", () => {
    const plan = planImport("holidays", "date,name\n20-10-2026,Diwali\n2026-12-25,Christmas\n25/12/2026,Xmas", snapshot());
    expect(plan.rows.map((row) => row.action)).toEqual(["update", "error", "error"]);
    const ok = planImport("holidays", "date,name\n20-10-2026,Diwali\n2026-12-25,Christmas", snapshot());
    expect(ok.ops).toMatchObject([{ kind: "holiday", exists: true, value: { date: "2026-10-20", name: "Diwali" } }, { kind: "holiday", exists: false }]);
  });
});
