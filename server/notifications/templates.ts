// WhatsApp template catalogue (S6-04, Q-013, P0-14). One entry per event the
// app sends on WhatsApp: the wording to create in CEOITBox, its {{n}}
// variables in order, and sample values for Meta's review. The Super Admin
// records the approved name in /superadmin/templates; notify() then fills
// the variables by key in this order. Pure; a test keeps it in step with the
// messages the code sends and with docs/NOTIFICATION-TEMPLATES.md.
//
// Meta rules followed: Utility category, lowercase names, the body never
// starts or ends with a variable, every variable has a sample, and values
// are sent on one line (see whatsappValue).
export interface TemplateVariable {
  key: string;
  label: string;
  sample: string;
}

export interface TemplateEntry {
  code: string; // stable ARS id (whatsapp_templates.template_code)
  eventType: string; // notify() eventType
  name: string; // suggested CEOITBox / Meta template name
  group: "Approvals" | "Security";
  purpose: string;
  sentTo: string;
  variables: TemplateVariable[];
  body: string; // {{1}}, {{2}}… in variable order
  emailSubject: string; // the matching email's subject, with sample values
}

// Short screen names for the Super Admin's list (S9-15); the purpose stays
// as the longer explanation.
const SHORT_LABEL: Record<string, string> = {
  APPROVAL_NEEDED: "Approval needed",
  REQUEST_APPROVED: "Request approved",
  REQUEST_REJECTED: "Request rejected",
  CHANGES_REQUESTED: "Changes requested",
  REQUEST_ON_HOLD: "Request on hold",
  REQUEST_WITHDRAWN: "Request withdrawn",
  REQUEST_REOPENED: "Request reopened",
  REQUEST_COMMENT: "New comment",
  REQUEST_MENTION: "You were mentioned",
  APPROVAL_REMINDER: "Approval reminder",
  APPROVAL_DUE_SOON: "Approval due soon",
  APPROVAL_ESCALATED: "Approval escalated",
  REQUEST_BLOCKED: "Request blocked",
  TASK_ASSIGNED: "Task for you",
  REQUEST_FYI: "For your information",
  REQUEST_RESUMED: "Request resumed",
  REQUEST_RESUBMITTED: "Changes made",
  REQUEST_DELETED: "Request removed",
  REQUEST_UNBLOCKED: "Request moving again",
  NEW_LOGIN: "New sign-in",
  ACCOUNT_LOCKED: "Account locked",
  ACCOUNT_SECURED: "Account secured",
  SECURITY_ALERT: "Security alert",
  SUPER_ADMIN_SIGNIN: "Super Admin signed in",
  BREAK_GLASS_USED: "Break-glass used",
  PASSWORD_CHANGED: "Password changed",
  WHATSAPP_CHANGED: "WhatsApp number changed",
  SIGN_IN_METHOD_CHANGED: "Sign-in method changed",
};

export function templateLabel(eventType: string): string {
  const known = SHORT_LABEL[eventType];
  if (known) return known;
  const words = eventType.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const SIGN_OFF = "— ARS Approvals";
const LINK_NOTE = "Open it here (sign-in needed):";

const v = (key: string, label: string, sample: string): TemplateVariable => ({ key, label, sample });
const REQUEST_NO = v("request_no", "Request number", "PUR-2026-000123");
const TITLE = v("title", "Request title", "Laptop for the new engineer");
const LINK = v("link", "Link to the request", "https://approval.arssteels.net/users/requests/123");
const USER = v("user_name", "Person's name", "Ravi Kumar");

export const WHATSAPP_TEMPLATES: readonly TemplateEntry[] = [
  {
    code: "WA_APPROVAL_NEEDED_V1",
    emailSubject: "Approval needed: PUR-2026-000123",
    eventType: "APPROVAL_NEEDED",
    name: "ars_approval_needed_v1",
    group: "Approvals",
    purpose: "A request is waiting for this person's approval (also when an approval is handed over to them).",
    sentTo: "The approver (and their delegate)",
    variables: [v("requester_name", "Raised by", "Ravi Kumar"), REQUEST_NO, TITLE, LINK],
    body: `Approval needed\n\n{{1}} needs your approval for {{2}}: {{3}}.\n\n${LINK_NOTE} {{4}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_REQUEST_APPROVED_V1",
    emailSubject: "Approved: PUR-2026-000123",
    eventType: "REQUEST_APPROVED",
    name: "ars_request_approved_v1",
    group: "Approvals",
    purpose: "Every level has approved the request.",
    sentTo: "The requester",
    variables: [REQUEST_NO, TITLE, LINK],
    body: `Request approved\n\nYour request {{1}}: {{2}} is fully approved.\n\nDetails: {{3}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_REQUEST_REJECTED_V1",
    emailSubject: "Rejected: PUR-2026-000123",
    eventType: "REQUEST_REJECTED",
    name: "ars_request_rejected_v1",
    group: "Approvals",
    purpose: "An approver rejected the request (a reason is always given).",
    sentTo: "The requester",
    variables: [REQUEST_NO, TITLE, v("reason", "Reason", "Budget not available this quarter"), LINK],
    body: `Request rejected\n\nYour request {{1}}: {{2}} was rejected.\nReason: {{3}}\n\nDetails: {{4}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_CHANGES_REQUESTED_V1",
    emailSubject: "Changes needed: PUR-2026-000123",
    eventType: "CHANGES_REQUESTED",
    name: "ars_changes_requested_v1",
    group: "Approvals",
    purpose: "An approver sent the request back for changes.",
    sentTo: "The requester",
    variables: [REQUEST_NO, TITLE, v("reason", "What to change", "Attach two quotes"), LINK],
    body: `Changes needed\n\nAn approver asked for changes to {{1}}: {{2}}.\nWhat to change: {{3}}\n\nUpdate and resubmit it here: {{4}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_REQUEST_ON_HOLD_V1",
    emailSubject: "On hold: PUR-2026-000123",
    eventType: "REQUEST_ON_HOLD",
    name: "ars_request_on_hold_v1",
    group: "Approvals",
    purpose: "An approver put the request on hold.",
    sentTo: "The requester",
    variables: [REQUEST_NO, TITLE, v("reason", "Reason (may be a dash)", "Waiting for the budget review"), LINK],
    body: `Request on hold\n\nYour request {{1}}: {{2}} is on hold.\nReason: {{3}}\n\nDetails: {{4}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_REQUEST_WITHDRAWN_V1",
    emailSubject: "Withdrawn: PUR-2026-000123",
    eventType: "REQUEST_WITHDRAWN",
    name: "ars_request_withdrawn_v1",
    group: "Approvals",
    purpose: "The requester withdrew a request that was waiting for this person.",
    sentTo: "Approvers who still had it pending",
    variables: [REQUEST_NO, TITLE, v("requester_name", "Withdrawn by", "Ravi Kumar"), LINK],
    body: `Request withdrawn\n\n{{1}}: {{2}} was withdrawn by {{3}}, so your approval is no longer needed.\n\nDetails: {{4}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_REQUEST_REOPENED_V1",
    emailSubject: "Reopened: PUR-2026-000123",
    eventType: "REQUEST_REOPENED",
    name: "ars_request_reopened_v1",
    group: "Approvals",
    purpose: "The Super Admin reopened an approved request; it goes through approval again.",
    sentTo: "The requester",
    variables: [REQUEST_NO, TITLE, v("reason", "Reason", "Vendor changed the price"), LINK],
    body: `Request reopened\n\nYour approved request {{1}}: {{2}} was reopened and goes through approval again.\nReason: {{3}}\n\nDetails: {{4}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_REQUEST_COMMENT_V1",
    emailSubject: "New comment on PUR-2026-000123",
    eventType: "REQUEST_COMMENT",
    name: "ars_request_comment_v1",
    group: "Approvals",
    purpose: "Someone commented on a request this person is part of.",
    sentTo: "The requester and everyone with an approval on it",
    variables: [v("author", "Comment by", "Meena Iyer"), REQUEST_NO, TITLE, LINK],
    body: `New comment\n\n{{1}} commented on {{2}}: {{3}}.\n\nRead and reply here: {{4}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_APPROVAL_REMINDER_V1",
    emailSubject: "Reminder: PUR-2026-000123 is waiting for you",
    eventType: "APPROVAL_REMINDER",
    name: "ars_approval_reminder_v1",
    group: "Approvals",
    purpose: "An approval has passed its response time (working hours).",
    sentTo: "The approver (and their delegate)",
    variables: [REQUEST_NO, TITLE, LINK],
    body: `Reminder: approval waiting\n\n{{1}}: {{2}} has passed its response time and is still waiting for your decision.\n\n${LINK_NOTE} {{3}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_APPROVAL_ESCALATED_V1",
    emailSubject: "Escalation: PUR-2026-000123 is stuck with Manoj Menon",
    eventType: "APPROVAL_ESCALATED",
    name: "ars_approval_escalated_v1",
    group: "Approvals",
    purpose: "An approver hasn't acted for twice the response time.",
    sentTo: "The approver's manager and the IT team",
    variables: [v("approver_name", "Approver", "Manoj Menon"), v("step", "Level", "HOD approval"), REQUEST_NO, TITLE, LINK],
    body: `Approval escalated\n\n{{1}} hasn't acted on "{{2}}" for twice the allowed time.\nRequest: {{3}}: {{4}}\n\nIT can hand it over if needed: {{5}}\n\n${SIGN_OFF}`,
  },
  // v1.4.0 (D-097, D-098): work steps, FYI steps, resume/resubmit, delete, unblock.
  {
    code: "WA_TASK_ASSIGNED_V1",
    emailSubject: "Task for you: PUR-2026-000123",
    eventType: "TASK_ASSIGNED",
    name: "ars_task_assigned_v1",
    group: "Approvals",
    purpose: "A work step (e.g. raise the PO after approval) is given to this person.",
    sentTo: "The person who has to do the work",
    variables: [REQUEST_NO, TITLE, v("step", "Work", "Raise the purchase order"), LINK],
    body: `Task for you\n\nThere is work for you on {{1}}: {{2}}.\nWhat to do: {{3}}\n\nOpen it, do the work, then mark it done: {{4}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_REQUEST_FYI_V1",
    emailSubject: "FYI: PUR-2026-000123",
    eventType: "REQUEST_FYI",
    name: "ars_request_fyi_v1",
    group: "Approvals",
    purpose: "An FYI step: the request reached a point this person should know about. Nothing to do.",
    sentTo: "The people the FYI step names",
    variables: [REQUEST_NO, TITLE, v("step", "Step", "Budget booked"), v("note", "Note (may be a dash)", "PO raised"), LINK],
    body: `For your information\n\n{{1}}: {{2}} reached "{{3}}".\n{{4}}\n\nNothing to do. Details: {{5}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_REQUEST_RESUMED_V1",
    emailSubject: "Resumed: PUR-2026-000123",
    eventType: "REQUEST_RESUMED",
    name: "ars_request_resumed_v1",
    group: "Approvals",
    purpose: "A request on hold is back in progress.",
    sentTo: "The requester and the approvers it waits for",
    variables: [REQUEST_NO, TITLE, LINK],
    body: `Request resumed\n\n{{1}}: {{2}} is no longer on hold.\n\nDetails: {{3}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_REQUEST_RESUBMITTED_V1",
    emailSubject: "Resubmitted: PUR-2026-000123",
    eventType: "REQUEST_RESUBMITTED",
    name: "ars_request_resubmitted_v1",
    group: "Approvals",
    purpose: "The requester made the changes this approver asked for.",
    sentTo: "The approver who asked for changes",
    variables: [v("requester_name", "Raised by", "Ravi Kumar"), REQUEST_NO, TITLE, LINK],
    body: `Changes made\n\n{{1}} made the changes you asked for on {{2}}: {{3}}.\n\n${LINK_NOTE} {{4}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_REQUEST_DELETED_V1",
    emailSubject: "Removed: PUR-2026-000123",
    eventType: "REQUEST_DELETED",
    name: "ars_request_deleted_v1",
    group: "Approvals",
    purpose: "IT removed the person's request (e.g. a test or a mistake).",
    sentTo: "The requester",
    variables: [REQUEST_NO, TITLE, v("reason", "Reason", "Raised twice by mistake")],
    body: `Request removed\n\nYour request {{1}}: {{2}} was removed by IT.\nReason: {{3}}\n\nAsk IT if you think this is a mistake.\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_REQUEST_UNBLOCKED_V1",
    emailSubject: "Moving again: PUR-2026-000123",
    eventType: "REQUEST_UNBLOCKED",
    name: "ars_request_unblocked_v1",
    group: "Approvals",
    purpose: "IT fixed the step that was holding up the request.",
    sentTo: "The requester",
    variables: [REQUEST_NO, TITLE, v("step", "Level", "Finance approval"), LINK],
    body: `Request moving again\n\n{{1}}: {{2}} is moving again. IT fixed the step "{{3}}".\n\nDetails: {{4}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_REQUEST_BLOCKED_V1",
    emailSubject: "Blocked: PUR-2026-000123",
    eventType: "REQUEST_BLOCKED",
    name: "ars_request_blocked_v1",
    group: "Approvals",
    purpose: "A request can't move on (no approver found, or no path matches).",
    sentTo: "The IT team",
    variables: [REQUEST_NO, TITLE, v("step", "Level", "Finance approval"), v("reason", "Why", "no eligible approver"), LINK],
    body: `Request blocked\n\n{{1}}: {{2}} can't move on at "{{3}}" because of: {{4}}.\n\nPlease fix it here: {{5}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_NEW_LOGIN_V1",
    emailSubject: "New sign-in to your ARS Approvals account",
    eventType: "NEW_LOGIN",
    name: "ars_new_login_v1",
    group: "Security",
    purpose: "A sign-in from a new device or browser.",
    sentTo: "The person who signed in",
    variables: [USER, v("time", "When", "07 Oct 2026, 10:42 am"), v("device", "Device", "Chrome on Windows"), v("ip_address", "IP address", "103.21.58.10"), v("link", "\"This wasn't me\" link", "https://approval.arssteels.net/api/auth/not-me?t=abc123")],
    body: `New sign-in\n\nHi {{1}}, there was a new sign-in to your ARS Approvals account.\nWhen: {{2}}\nDevice: {{3}}\nIP address: {{4}}\n\nIf this wasn't you, open this link to sign out everywhere and lock your account: {{5}}\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_ACCOUNT_LOCKED_V1",
    emailSubject: "Your ARS Approvals account was locked",
    eventType: "ACCOUNT_LOCKED",
    name: "ars_account_locked_v1",
    group: "Security",
    purpose: "Too many wrong passwords locked the account for a while.",
    sentTo: "The account holder",
    variables: [USER, v("minutes", "Minutes", "15")],
    body: `Account locked\n\nHi {{1}}, your ARS Approvals account was locked for {{2}} minutes after too many wrong passwords.\n\nIf this wasn't you, contact IT (itadmin@arssteels.co.in).\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_ACCOUNT_SECURED_V1",
    emailSubject: "Your ARS Approvals account was secured",
    eventType: "ACCOUNT_SECURED",
    name: "ars_account_secured_v1",
    group: "Security",
    purpose: "The person pressed \"This wasn't me\"; every session was ended and the account locked.",
    sentTo: "The account holder",
    variables: [USER],
    body: `Account secured\n\nHi {{1}}, you reported a sign-in that wasn't you. We signed your account out everywhere and locked it.\n\nIT will contact you to unlock it.\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_SECURITY_ALERT_V1",
    emailSubject: "Security: Ravi Kumar reported an unknown sign-in",
    eventType: "SECURITY_ALERT",
    name: "ars_security_alert_v1",
    group: "Security",
    purpose: "Someone reported a sign-in that wasn't them.",
    sentTo: "The Super Admin",
    variables: [USER, v("login_id", "User ID", "emp1042")],
    body: `Security alert\n\n{{1}} (User ID {{2}}) reported a sign-in that wasn't them. Their account is locked until you unlock it in the Admin Portal.\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_SUPER_ADMIN_SIGNIN_V1",
    emailSubject: "Super Admin sign-in",
    eventType: "SUPER_ADMIN_SIGNIN",
    name: "ars_super_admin_signin_v1",
    group: "Security",
    purpose: "The Super Admin account signed in.",
    sentTo: "The Super Admin",
    variables: [USER, v("time", "When", "07 Oct 2026, 10:42 am"), v("device", "Device", "Chrome on Windows"), v("ip_address", "IP address", "103.21.58.10")],
    body: `Super Admin sign-in\n\n{{1}} signed in as Super Admin.\nWhen: {{2}}\nDevice: {{3}}\nIP address: {{4}}\n\nIf this wasn't expected, act now.\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_BREAK_GLASS_USED_V1",
    emailSubject: "Super Admin sign-in",
    eventType: "BREAK_GLASS_USED",
    name: "ars_break_glass_used_v1",
    group: "Security",
    purpose: "The sealed emergency (break-glass) account signed in.",
    sentTo: "The Super Admin",
    variables: [USER, v("time", "When", "07 Oct 2026, 10:42 am"), v("device", "Device", "Chrome on Windows"), v("ip_address", "IP address", "103.21.58.10")],
    body: `Emergency account used\n\nThe break-glass account {{1}} signed in.\nWhen: {{2}}\nDevice: {{3}}\nIP address: {{4}}\n\nIf this wasn't planned, act now.\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_PASSWORD_CHANGED_V1",
    emailSubject: "Your ARS Approvals password was changed",
    eventType: "PASSWORD_CHANGED",
    name: "ars_password_changed_v1",
    group: "Security",
    purpose: "The password was set or changed; every device was signed out.",
    sentTo: "The account holder",
    variables: [USER, v("time", "When", "07 Oct 2026, 10:42 am")],
    body: `Password changed\n\nHi {{1}}, your ARS Approvals password was set on {{2}}. You were signed out on every device.\n\nIf you didn't do this, contact IT (itadmin@arssteels.co.in).\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_WHATSAPP_CHANGED_V1",
    emailSubject: "Your WhatsApp number was changed",
    eventType: "WHATSAPP_CHANGED",
    name: "ars_whatsapp_changed_v1",
    group: "Security",
    purpose: "IT changed the WhatsApp number on the account (sent to the new number).",
    sentTo: "The account holder",
    variables: [USER],
    body: `WhatsApp number changed\n\nHi {{1}}, the WhatsApp number on your ARS Approvals account was changed by IT.\n\nIf you didn't expect this, contact IT (itadmin@arssteels.co.in).\n\n${SIGN_OFF}`,
  },
  {
    code: "WA_SIGN_IN_METHOD_CHANGED_V1",
    emailSubject: "How you sign in to ARS Approvals has changed",
    eventType: "SIGN_IN_METHOD_CHANGED",
    name: "ars_signin_method_changed_v1",
    group: "Security",
    purpose: "IT switched the person between Google sign-in and User ID + password.",
    sentTo: "The account holder",
    variables: [USER, v("method", "New sign-in method", "User ID and password")],
    body: `Sign-in method changed\n\nHi {{1}}, IT changed how you sign in to ARS Approvals. You now sign in with: {{2}}.\n\nIf you didn't expect this, contact IT (itadmin@arssteels.co.in).\n\n${SIGN_OFF}`,
  },
];

// Already approved and shared with the Power BI website (D-036, D-042).
export const EXISTING_OTP_TEMPLATE = { code: "WA_LOGIN_OTP_V1", eventType: "OTP_LOGIN", name: "wa_login_otp_v1", category: "Authentication" } as const;

// Sent by email and in-app only, on purpose.
export const EMAIL_ONLY_EVENTS: readonly { eventType: string; emailSubject: string; why: string }[] = [
  { eventType: "SET_PASSWORD_LINK", emailSubject: "Set your ARS Approvals password", why: "The set-password link goes to the email on record; the WhatsApp code then confirms the number." },
  { eventType: "USER_INVITED", emailSubject: "You've been added to ARS Approvals", why: "Owner choice (D-166): invitations go by email, with the set-password link for password users." },
  { eventType: "PASSWORD_RESET_LINK", emailSubject: "Reset your ARS Approvals password", why: "Owner choice (D-166): the reset link goes to the email on record; the WhatsApp code then confirms it." },
];

export function findTemplateEntry(code: string): TemplateEntry | undefined {
  return WHATSAPP_TEMPLATES.find((entry) => entry.code === code);
}

// Meta rejects parameters with new lines, tabs, more than four spaces in a
// row, or nothing at all. Long values are cut so the message stays short.
export function whatsappValue(raw: string, max = 300): string {
  const flat = raw.replace(/\s+/g, " ").trim();
  if (!flat) return "-";
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// Problems with an entry (used by the test and the registry screen).
export function checkTemplateEntry(entry: TemplateEntry): string[] {
  const problems: string[] = [];
  const numbers = [...entry.body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  const expected = entry.variables.map((_, index) => index + 1);
  if ([...new Set(numbers)].sort((a, b) => a - b).join() !== expected.join()) problems.push(`${entry.code}: body uses {{${numbers.join("}}, {{")}}} but has ${expected.length} variables.`);
  if (/^\s*\{\{/.test(entry.body) || /\}\}\s*$/.test(entry.body)) problems.push(`${entry.code}: the body can't start or end with a variable.`);
  if (!/^[a-z0-9_]{1,512}$/.test(entry.name)) problems.push(`${entry.code}: names use lowercase letters, numbers and _ only.`);
  if (entry.body.length > 1024) problems.push(`${entry.code}: the body is over 1,024 characters.`);
  if (new Set(entry.variables.map((variable) => variable.key)).size !== entry.variables.length) problems.push(`${entry.code}: a variable key is used twice.`);
  return problems;
}

// The body with the sample values filled in (what the person will see).
export function previewBody(entry: TemplateEntry): string {
  return entry.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => entry.variables[Number(n) - 1]?.sample ?? "");
}

// docs/NOTIFICATION-TEMPLATES.md is generated from this catalogue
// (node scripts/dev/write-templates-doc.mjs); a test checks it is current.
export function renderTemplatesDoc(): string {
  const lines: string[] = [
    "# Notification templates (WhatsApp and email)",
    "",
    "Generated from `server/notifications/templates.ts`. Don't edit by hand; run `node scripts/dev/write-templates-doc.mjs`.",
    "",
    "## How to create them",
    "The app creates them for you, through the CEOITBox API (D-076, docs/CEOITBOX-API.md):",
    "1. Open **/superadmin/templates** and pick a message. The suggested wording below is filled in. Change it if you like, using the named placeholders such as `{{request_no}}`.",
    "2. Press **Save draft**, check the preview, then **Submit to Meta for approval**. The app sends it as category **Utility**, language **English**, with the sample values.",
    "3. Meta usually decides within minutes to a day. Press **Sync status**: an approved template goes live by itself; a rejected one shows Meta's reason.",
    "4. Until a template is live, that WhatsApp message is skipped. Email and in-app messages still go out.",
    "",
    "A template made by hand in the CEOITBox dashboard also works: save a draft with its exact name in the app, then sync.",
    "",
    "Rules kept so Meta accepts them:",
    "- No message starts or ends with a variable.",
    "- Every variable has a sample.",
    "- The app sends values on one line, cut to 300 characters.",
    `- The sign-in code reuses the Power BI website's approved template \`${EXISTING_OTP_TEMPLATE.name}\` (${EXISTING_OTP_TEMPLATE.category}), so it needs nothing new.`,
    "",
    "## Summary",
    "| # | Suggested name | When | Sent to | Variables |",
    "|---|---|---|---|---|",
    ...WHATSAPP_TEMPLATES.map((entry, index) => `| ${index + 1} | \`${entry.name}\` | ${entry.purpose} | ${entry.sentTo} | ${entry.variables.length} |`),
    "",
  ];
  for (const group of ["Approvals", "Security"] as const) {
    lines.push(`## ${group} messages`, "");
    for (const entry of WHATSAPP_TEMPLATES.filter((item) => item.group === group)) {
      lines.push(
        `### \`${entry.name}\``,
        `- **When:** ${entry.purpose}`,
        `- **Sent to:** ${entry.sentTo}`,
        `- **Category / language:** Utility / English`,
        `- **App event:** \`${entry.eventType}\` (registry code \`${entry.code}\`)`,
        `- **Matching email subject:** ${entry.emailSubject}`,
        "",
        "Body to paste into CEOITBox:",
        "```",
        entry.body,
        "```",
        "",
        "| Variable | Holds | Sample for Meta |",
        "|---|---|---|",
        ...entry.variables.map((variable, index) => `| \`{{${index + 1}}}\` | ${variable.label} | ${variable.sample} |`),
        "",
        "What the person sees (with the samples):",
        "```",
        previewBody(entry),
        "```",
        "",
      );
    }
  }
  lines.push(
    "## Email only",
    "",
    "| App event | Email subject | Why no WhatsApp |",
    "|---|---|---|",
    ...EMAIL_ONLY_EVENTS.map((item) => `| \`${item.eventType}\` | ${item.emailSubject} | ${item.why} |`),
    "",
    "## Emails",
    "Every message above is also sent by email from itadmin@arssteels.co.in (through Resend), with the subject shown and the same details as plain text. Emails need no approval: they work as soon as the Resend key is entered in /superadmin/settings.",
    "",
  );
  return lines.join("\n");
}
