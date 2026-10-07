import type { BuilderSpec, BuilderStep } from "@/server/workflows/builder";
import type { FormField } from "@/server/forms/fields";

// Demo data (S6-02a, F-57, D-071): stand-in staff until the owner's staff
// list arrives, and the first approval types (F-60 to F-71) built on it.
// Pure. Names are invented; none is a real ARS employee. Approvers are
// picked through groups and department HODs, so the real people can be put
// in later (group members, HOD on the department) without editing any
// workflow.
export interface DemoPerson {
  key: string;
  name: string;
  department: string; // department code
  designation: string; // designation code
  manager: string | null; // key of an earlier person
}

export const DEMO_DESIGNATIONS = [
  { code: "MD", name: "Managing Director" },
  { code: "ED", name: "Executive Director" },
  { code: "DIRECTOR", name: "Director" },
  { code: "HOD", name: "Head of Department" },
  { code: "MANAGER", name: "Manager" },
  { code: "EXECUTIVE", name: "Executive" },
  { code: "ACCOUNTANT", name: "Accountant" },
] as const;

// HOD = the person key that heads it.
export const DEMO_DEPARTMENTS = [
  { code: "MGMT", name: "Management", hod: "md" },
  { code: "FIN", name: "Finance & Accounts", hod: "finhead" },
  { code: "SCM", name: "Purchase & SCM", hod: "scmhead" },
  { code: "HR", name: "HR & Admin", hod: "hrhead" },
  { code: "IT", name: "IT", hod: "ithead" },
  { code: "SALES", name: "Sales & NBD", hod: "saleshead" },
  { code: "PLANT", name: "Plant Operations", hod: "planthead" },
] as const;

// In order: a manager always comes before the people who report to them.
export const DEMO_PEOPLE: readonly DemoPerson[] = [
  { key: "md", name: "Arvind Rao", department: "MGMT", designation: "MD", manager: null },
  { key: "ed", name: "Meera Kapoor", department: "MGMT", designation: "ED", manager: "md" },
  { key: "director", name: "Sanjay Mehta", department: "MGMT", designation: "DIRECTOR", manager: "md" },
  { key: "finhead", name: "Lakshmi Iyer", department: "FIN", designation: "HOD", manager: "ed" },
  { key: "finctrl", name: "Prakash Nair", department: "FIN", designation: "MANAGER", manager: "finhead" },
  { key: "finl2a", name: "Deepa Menon", department: "FIN", designation: "MANAGER", manager: "finhead" },
  { key: "finl2b", name: "Vikram Shetty", department: "FIN", designation: "MANAGER", manager: "finhead" },
  { key: "checker1", name: "Divya Sharma", department: "FIN", designation: "ACCOUNTANT", manager: "finl2a" },
  { key: "checker2", name: "Karthik Reddy", department: "FIN", designation: "ACCOUNTANT", manager: "finl2b" },
  { key: "scmhead", name: "Farhan Ali", department: "SCM", designation: "HOD", manager: "ed" },
  { key: "buyer", name: "Arjun Das", department: "SCM", designation: "EXECUTIVE", manager: "scmhead" },
  { key: "hrhead", name: "Nisha Pillai", department: "HR", designation: "HOD", manager: "ed" },
  { key: "hrmgr", name: "Rahul Verma", department: "HR", designation: "MANAGER", manager: "hrhead" },
  { key: "recruiter", name: "Kavya Rao", department: "HR", designation: "MANAGER", manager: "hrhead" },
  { key: "ithead", name: "Thomas Mathew", department: "IT", designation: "HOD", manager: "ed" },
  { key: "itexec", name: "Imran Khan", department: "IT", designation: "EXECUTIVE", manager: "ithead" },
  { key: "saleshead", name: "Pooja Agarwal", department: "SALES", designation: "HOD", manager: "ed" },
  { key: "salesexec", name: "Rohit Jain", department: "SALES", designation: "EXECUTIVE", manager: "saleshead" },
  { key: "planthead", name: "Suresh Babu", department: "PLANT", designation: "HOD", manager: "ed" },
  { key: "plantexec", name: "Anita Joseph", department: "PLANT", designation: "EXECUTIVE", manager: "planthead" },
];

export const demoLoginId = (key: string) => `demo.${key}`;
// Plus-addressing: every demo email lands in the IT mailbox, so the owner
// sees exactly what staff will receive.
export const demoEmail = (key: string) => `itadmin+demo.${key}@arssteels.co.in`;
export const demoName = (name: string) => `${name} (demo)`;

// The "desks" that Asana pinned to one named person become groups.
export const DEMO_GROUPS = [
  { code: "MD_OFFICE", name: "MD office", members: ["md"] },
  { code: "ED_OFFICE", name: "ED office", members: ["ed"] },
  { code: "DIRECTOR_DESK", name: "Director's desk", members: ["director"] },
  { code: "FIN_CONTROLLER", name: "Finance controller desk", members: ["finctrl"] },
  { code: "FIN_CHECKERS", name: "Finance level 1 checkers", members: ["checker1", "checker2"] },
  { code: "FIN_LEVEL2", name: "Finance level 2", members: ["finl2a", "finl2b"] },
  { code: "HR_MANAGERS", name: "HR managers", members: ["hrmgr"] },
  { code: "RECRUITMENT", name: "Recruitment managers", members: ["recruiter"] },
] as const;

export type DemoGroupCode = (typeof DEMO_GROUPS)[number]["code"];
export type DemoDepartmentCode = (typeof DEMO_DEPARTMENTS)[number]["code"];

export interface DemoIds {
  group: (code: DemoGroupCode) => number;
  department: (code: DemoDepartmentCode) => number;
}

export interface DemoWorkflow {
  flow: string; // FLOWS.md id
  code: string;
  name: string;
  prefix: string;
  description: string;
  form: FormField[];
  builder: BuilderSpec;
}

// DoA example (Q-004): the bands used by Purchase & SCM. Change the
// numbers in the builder when the owner gives the real ones.
export const PURCHASE_DOA_BANDS = { finance: 100_000, ed: 1_000_000, md: 2_500_000 } as const;

const details: FormField = { key: "details", label: "Details", type: "LONG_TEXT", required: true, help: "What you need approved, and why." };
const amount = (required: boolean): FormField => ({ key: "amount", label: "Amount (₹)", type: "NUMBER", required });

export function demoWorkflows(ids: DemoIds): DemoWorkflow[] {
  const group = (id: string, label: string, code: DemoGroupCode, extra: Partial<BuilderStep> = {}): BuilderStep => ({
    id,
    label,
    approvers: { kind: "GROUP", groupId: ids.group(code) },
    rule: "ANY_ONE",
    slaHours: 24,
    ...extra,
  });
  const hod = (id: string, label: string, code: DemoDepartmentCode, extra: Partial<BuilderStep> = {}): BuilderStep => ({
    id,
    label,
    approvers: { kind: "DEPARTMENT_HOD", departmentId: ids.department(code) },
    rule: "ALL",
    slaHours: 24,
    ...extra,
  });
  const single = (...steps: BuilderStep[]): BuilderSpec => ({ stages: steps.map((step) => ({ kind: "STEP" as const, step })) });

  return [
    {
      flow: "F-60",
      code: "MD_APPROVAL",
      name: "MD Approval",
      prefix: "MDA",
      description: "Anything that needs the Managing Director's approval. Replaces the Asana MD approval project.",
      form: [details, amount(false)],
      builder: single(group("md", "MD", "MD_OFFICE", { slaHours: 48 })),
    },
    {
      flow: "F-61",
      code: "ED_APPROVAL",
      name: "ED Approval",
      prefix: "EDA",
      description: "Anything that needs the Executive Director's approval.",
      form: [details, amount(false)],
      builder: single(group("ed", "ED", "ED_OFFICE", { slaHours: 48 })),
    },
    {
      flow: "F-62",
      code: "FINANCE_CONTROLLER_APPROVAL",
      name: "Finance Approval (Finance controller)",
      prefix: "FNC",
      description: "Finance sign-off by the finance controller desk.",
      form: [details, amount(true)],
      builder: single(group("finctrl", "Finance controller", "FIN_CONTROLLER")),
    },
    {
      flow: "F-63",
      code: "FINANCE_HEAD_APPROVAL",
      name: "Finance Approval (Finance head)",
      prefix: "FNH",
      description: "Finance sign-off by the head of Finance & Accounts.",
      form: [details, amount(true)],
      builder: single(hod("finhead", "Finance head", "FIN")),
    },
    {
      flow: "F-64",
      code: "PURCHASE_SCM_APPROVAL",
      name: "Purchase & SCM Approval",
      prefix: "SCM",
      description: "Purchases and POs. The amount decides how many levels approve (DoA example): up to ₹1 lakh SCM head only; above ₹1 lakh adds Finance head; above ₹10 lakh adds ED; above ₹25 lakh adds MD.",
      form: [
        { key: "item", label: "Item or service", type: "TEXT", required: true },
        { key: "vendor", label: "Vendor", type: "TEXT", required: false },
        amount(true),
        { key: "budgeted", label: "In the approved budget?", type: "CHOICE", required: true, options: ["Yes", "No"] },
        details,
      ],
      builder: single(
        hod("scmhead", "Purchase & SCM head", "SCM"),
        hod("finance", "Finance head", "FIN", { skipWhen: { field: "amount", operator: "LTE", value: PURCHASE_DOA_BANDS.finance } }),
        group("ed", "ED", "ED_OFFICE", { skipWhen: { field: "amount", operator: "LTE", value: PURCHASE_DOA_BANDS.ed }, slaHours: 48 }),
        group("md", "MD", "MD_OFFICE", { skipWhen: { field: "amount", operator: "LTE", value: PURCHASE_DOA_BANDS.md }, slaHours: 48 }),
      ),
    },
    {
      flow: "F-65",
      code: "DIRECTOR_APPROVAL",
      name: "Director Approval",
      prefix: "DIR",
      description: "Approvals for the Director's desk, including New Business Development (NBD).",
      form: [{ key: "area", label: "Area", type: "CHOICE", required: true, options: ["NBD", "Sales", "Other"] }, details, amount(false)],
      builder: single(group("director", "Director", "DIRECTOR_DESK", { slaHours: 48 })),
    },
    {
      flow: "F-66",
      code: "HR_ADMIN_APPROVAL",
      name: "HR / Admin Approval",
      prefix: "HRA",
      description: "HR and administration requests: HR manager, then HR head.",
      form: [{ key: "category", label: "Category", type: "CHOICE", required: true, options: ["Leave / attendance", "Admin facility", "Policy exception", "Other"] }, details],
      builder: single(group("hrmgr", "HR manager", "HR_MANAGERS"), hod("hrhead", "HR head", "HR")),
    },
    {
      flow: "F-67",
      code: "RECRUITMENT_APPROVAL",
      name: "Recruitment Approval",
      prefix: "REC",
      description: "New or replacement positions: recruitment manager, then HR head.",
      form: [
        { key: "position", label: "Position", type: "TEXT", required: true },
        { key: "headcount", label: "How many", type: "NUMBER", required: true },
        { key: "kind", label: "New or replacement", type: "CHOICE", required: true, options: ["New position", "Replacement"] },
        details,
      ],
      builder: single(group("recruiter", "Recruitment manager", "RECRUITMENT"), hod("hrhead", "HR head", "HR")),
    },
    {
      flow: "F-68",
      code: "FINANCE_INTERNAL",
      name: "Finance Internal",
      prefix: "FIN",
      description: "Internal finance entries: a level 1 checker; level 2 only for payments, vendor advances and bank transfers; then the Finance head. Reject and hold work at every level.",
      form: [
        { key: "nature", label: "Nature", type: "CHOICE", required: true, options: ["Payment", "Vendor advance", "Bank transfer", "Journal entry", "Expense claim", "Other"] },
        amount(true),
        details,
      ],
      builder: {
        stages: [
          { kind: "STEP", step: group("l1", "Level 1 checker", "FIN_CHECKERS") },
          {
            kind: "BRANCH",
            id: "needs_l2",
            label: "Needs level 2?",
            condition: { field: "nature", operator: "IN", value: ["Payment", "Vendor advance", "Bank transfer"] },
            then: [{ kind: "STEP", step: group("l2", "Level 2", "FIN_LEVEL2") }],
            otherwise: [],
          },
          { kind: "STEP", step: hod("finhead", "Finance head", "FIN") },
        ],
      },
    },
    {
      flow: "F-69",
      code: "IT_INTERNAL",
      name: "IT Internal",
      prefix: "ITR",
      description: "IT requests (hardware, software, access): approved by the IT head. The hand-off of the work after approval comes with F-32.",
      form: [{ key: "type", label: "Request type", type: "CHOICE", required: true, options: ["New hardware", "Software / licence", "Access", "Other"] }, details, amount(false)],
      builder: single(hod("ithead", "IT head", "IT")),
    },
    {
      flow: "F-70",
      code: "PRICE_REALISATION",
      name: "Price Realisation",
      prefix: "PRR",
      description: "Price proposals: Sales, Plant, Purchase and Finance review together (all must approve), then ED, then MD.",
      form: [
        { key: "customer", label: "Customer", type: "TEXT", required: true },
        { key: "product", label: "Product", type: "TEXT", required: true },
        { key: "price", label: "Proposed price (₹ per tonne)", type: "NUMBER", required: true },
        details,
      ],
      builder: {
        stages: [
          {
            kind: "PARALLEL",
            id: "review",
            label: "Department heads review",
            join: "ALL",
            steps: [hod("sales", "Sales head", "SALES"), hod("plant", "Plant head", "PLANT"), hod("scm", "Purchase & SCM head", "SCM"), group("finctrl", "Finance controller", "FIN_CONTROLLER")],
          },
          { kind: "STEP", step: group("ed", "ED", "ED_OFFICE", { slaHours: 48 }) },
          { kind: "STEP", step: group("md", "MD", "MD_OFFICE", { slaHours: 48 }) },
        ],
      },
    },
    {
      flow: "F-71",
      code: "DEPARTMENT_APPROVAL",
      name: "Department Approval (Manager → HOD)",
      prefix: "DEP",
      description: "ASP, plant, branding, training and similar requests: the requester's own manager, then the head of the requester's department. Works for every department with no extra set-up.",
      form: [{ key: "category", label: "Category", type: "CHOICE", required: true, options: ["ASP", "Plant", "Branding", "Training", "Other"] }, details, amount(false)],
      builder: {
        stages: [
          { kind: "STEP", step: { id: "manager", label: "Reporting manager", approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL", onNoApprover: "SKIP", slaHours: 24 } },
          { kind: "STEP", step: { id: "hod", label: "Department head", approvers: { kind: "REQUESTER_DEPARTMENT_HOD" }, rule: "ALL", slaHours: 24 } },
        ],
      },
    },
  ];
}
