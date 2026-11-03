// What can be imported, and the columns of each template (S10-02, F-59).
// Pure: the import page, the downloads and the planner all read this.
export const IMPORT_KINDS = ["users", "departments", "designations", "groups", "holidays"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export interface ImportColumn {
  name: string; // header in the CSV, lower case
  required: boolean;
  help: string;
  example: string;
  /** v1.49.2: the header may leave it out (files made before it existed). */
  optional?: boolean;
}

export interface ImportKindSpec {
  kind: ImportKind;
  label: string; // "Users"
  noun: string; // "user"
  matchBy: string;
  note: string;
  columns: ImportColumn[];
}

const ACTIVE: ImportColumn = { name: "active", required: false, help: "Yes or No. Empty means Yes.", example: "Yes" };

export const IMPORT_SPECS: Record<ImportKind, ImportKindSpec> = {
  users: {
    kind: "users",
    label: "Users",
    noun: "user",
    matchBy: "User ID",
    note: "Existing User IDs are updated, new ones are created. Every column is applied as written, so an empty cell clears that value. Deactivating people stays on the user's page (pending approvals must be handed over first).",
    columns: [
      { name: "login_id", required: true, help: "User ID: letters, numbers, dot, dash or underscore.", example: "ravi.kumar" },
      { name: "name", required: true, help: "Full name.", example: "Ravi Kumar" },
      { name: "email", required: true, help: "The person's primary Google email (not an alias) if they sign in with Google.", example: "ravi.kumar@arssteels.co.in" },
      { name: "whatsapp_number", required: false, help: "With country code. A 10-digit Indian mobile gets 91 added. Needed for password sign-in.", example: "919876543210" },
      { name: "department_code", required: false, help: "Code of an existing active department.", example: "FIN" },
      { name: "designation_code", required: false, help: "Code of an existing active designation.", example: "MGR" },
      { name: "manager_login_id", required: false, help: "User ID of the reporting manager: an existing person or another row of this file.", example: "anbu" },
      { name: "sign_in_method", required: false, help: "GOOGLE, PASSWORD or BOTH (either). Empty means GOOGLE.", example: "GOOGLE" },
      {
        name: "modules",
        required: false,
        optional: true,
        help: "Module access: APPROVAL, TASK, INFORMATION, AI separated by ; (or ALL). Empty: a new person gets APPROVAL;TASK;INFORMATION and an existing person keeps what they have.",
        example: "APPROVAL;TASK;INFORMATION",
      },
      { name: "roles", required: false, help: "USER, EXPORTER, IT_ADMIN, SUPER_ADMIN separated by ; (USER is always included; EXPORTER may download reports). Only a Super Admin can grant or remove SUPER_ADMIN.", example: "USER" },
    ],
  },
  departments: {
    kind: "departments",
    label: "Departments",
    noun: "department",
    matchBy: "code",
    note: "Existing codes are updated, new ones are created. Import users first if the HOD is new.",
    columns: [
      { name: "code", required: true, help: "Short code: letters, numbers, dash or underscore. Saved in capitals.", example: "FIN" },
      { name: "name", required: true, help: "Department name.", example: "Finance" },
      { name: "hod_login_id", required: false, help: "User ID of the head of department (an existing active person).", example: "valarmadhi" },
      ACTIVE,
    ],
  },
  designations: {
    kind: "designations",
    label: "Designations",
    noun: "designation",
    matchBy: "code",
    note: "Existing codes are updated, new ones are created.",
    columns: [
      { name: "code", required: true, help: "Short code: letters, numbers, dash or underscore. Saved in capitals.", example: "MGR" },
      { name: "name", required: true, help: "Designation name.", example: "Manager" },
      { name: "approver", required: false, help: "Yes if people with this designation can be chosen as approvers (Manager and above). Empty means No.", example: "Yes" },
      ACTIVE,
    ],
  },
  groups: {
    kind: "groups",
    label: "Approver groups",
    noun: "group",
    matchBy: "code",
    note: "The members cell is the full list: people left out are removed from the group. Changes apply to approval steps that start from now on.",
    columns: [
      { name: "code", required: true, help: "Short code: letters, numbers, dash or underscore. Saved in capitals.", example: "FIN_CHECKERS" },
      { name: "name", required: true, help: "Group name.", example: "Finance checkers" },
      { name: "members", required: false, help: "User IDs of active people, separated by ;", example: "anbu;naveen" },
      ACTIVE,
    ],
  },
  holidays: {
    kind: "holidays",
    label: "Holidays",
    noun: "holiday",
    matchBy: "date",
    note: "Existing dates get the new name, new dates are added. Removing a holiday stays on the Working calendar page.",
    columns: [
      { name: "date", required: true, help: "YYYY-MM-DD, or DD-MM-YYYY / DD/MM/YYYY.", example: "2026-10-20" },
      { name: "name", required: true, help: "Holiday name.", example: "Deepavali" },
    ],
  },
};

export function isImportKind(value: unknown): value is ImportKind {
  return typeof value === "string" && (IMPORT_KINDS as readonly string[]).includes(value);
}

export const IMPORT_LIMITS = { maxBytes: 2 * 1024 * 1024, maxRows: 2000 } as const;
