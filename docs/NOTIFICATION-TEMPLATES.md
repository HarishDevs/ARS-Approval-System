# Notification templates (WhatsApp and email)

Generated from `server/notifications/templates.ts`. Don't edit by hand; run `node scripts/dev/write-templates-doc.mjs`.

## How to create them
The app creates them for you, through the CEOITBox API (D-076, docs/CEOITBOX-API.md):
1. Open **/superadmin/templates** and pick a message. The suggested wording below is filled in. Change it if you like, using the named placeholders such as `{{request_no}}`.
2. Press **Save draft**, check the preview, then **Submit to Meta for approval**. The app sends it as category **Utility**, language **English**, with the sample values.
3. Meta usually decides within minutes to a day. Press **Sync status**: an approved template goes live by itself; a rejected one shows Meta's reason.
4. Until a template is live, that WhatsApp message is skipped. Email and in-app messages still go out.

A template made by hand in the CEOITBox dashboard also works: save a draft with its exact name in the app, then sync.

Rules kept so Meta accepts them:
- No message starts or ends with a variable.
- Every variable has a sample.
- The app sends values on one line, cut to 300 characters.
- The sign-in code reuses the Power BI website's approved template `wa_login_otp_v1` (Authentication), so it needs nothing new.

## Summary
| # | Suggested name | When | Sent to | Variables |
|---|---|---|---|---|
| 1 | `ars_approval_needed_v1` | A request is waiting for this person's approval (also when an approval is handed over to them). | The approver (and their delegate) | 4 |
| 2 | `ars_request_approved_v1` | Every level has approved the request. | The requester | 3 |
| 3 | `ars_request_rejected_v1` | An approver rejected the request (a reason is always given). | The requester | 4 |
| 4 | `ars_changes_requested_v1` | An approver sent the request back for changes. | The requester | 4 |
| 5 | `ars_request_on_hold_v1` | An approver put the request on hold. | The requester | 4 |
| 6 | `ars_request_withdrawn_v1` | The requester withdrew a request that was waiting for this person. | Approvers who still had it pending | 4 |
| 7 | `ars_request_reopened_v1` | The Super Admin reopened an approved request; it goes through approval again. | The requester | 4 |
| 8 | `ars_request_comment_v1` | Someone commented on a request this person is part of. | The requester and everyone with an approval on it | 4 |
| 9 | `ars_approval_reminder_v1` | An approval has passed its response time (working hours). | The approver (and their delegate) | 3 |
| 10 | `ars_approval_escalated_v1` | An approver hasn't acted for twice the response time. | The approver's manager and the IT team | 5 |
| 11 | `ars_task_assigned_v1` | A work step (e.g. raise the PO after approval) is given to this person. | The person who has to do the work | 4 |
| 12 | `ars_request_fyi_v1` | An FYI step: the request reached a point this person should know about. Nothing to do. | The people the FYI step names | 5 |
| 13 | `ars_request_resumed_v1` | A request on hold is back in progress. | The requester and the approvers it waits for | 3 |
| 14 | `ars_request_resubmitted_v1` | The requester made the changes this approver asked for. | The approver who asked for changes | 4 |
| 15 | `ars_request_deleted_v1` | IT removed the person's request (e.g. a test or a mistake). | The requester | 3 |
| 16 | `ars_request_unblocked_v1` | IT fixed the step that was holding up the request. | The requester | 4 |
| 17 | `ars_request_blocked_v1` | A request can't move on (no approver found, or no path matches). | The IT team | 5 |
| 18 | `ars_new_login_v1` | A sign-in from a new device or browser. | The person who signed in | 5 |
| 19 | `ars_account_locked_v1` | Too many wrong passwords locked the account for a while. | The account holder | 2 |
| 20 | `ars_account_secured_v1` | The person pressed "This wasn't me"; every session was ended and the account locked. | The account holder | 1 |
| 21 | `ars_security_alert_v1` | Someone reported a sign-in that wasn't them. | The Super Admin | 2 |
| 22 | `ars_super_admin_signin_v1` | The Super Admin account signed in. | The Super Admin | 4 |
| 23 | `ars_break_glass_used_v1` | The sealed emergency (break-glass) account signed in. | The Super Admin | 4 |
| 24 | `ars_password_changed_v1` | The password was set or changed; every device was signed out. | The account holder | 2 |
| 25 | `ars_whatsapp_changed_v1` | IT changed the WhatsApp number on the account (sent to the new number). | The account holder | 1 |
| 26 | `ars_signin_method_changed_v1` | IT switched the person between Google sign-in and User ID + password. | The account holder | 2 |

## Approvals messages

### `ars_approval_needed_v1`
- **When:** A request is waiting for this person's approval (also when an approval is handed over to them).
- **Sent to:** The approver (and their delegate)
- **Category / language:** Utility / English
- **App event:** `APPROVAL_NEEDED` (registry code `WA_APPROVAL_NEEDED_V1`)
- **Matching email subject:** Approval needed: PUR-2026-000123

Body to paste into CEOITBox:
```
Approval needed

{{1}} needs your approval for {{2}}: {{3}}.

Open it here (sign-in needed): {{4}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Raised by | Ravi Kumar |
| `{{2}}` | Request number | PUR-2026-000123 |
| `{{3}}` | Request title | Laptop for the new engineer |
| `{{4}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Approval needed

Ravi Kumar needs your approval for PUR-2026-000123: Laptop for the new engineer.

Open it here (sign-in needed): https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_request_approved_v1`
- **When:** Every level has approved the request.
- **Sent to:** The requester
- **Category / language:** Utility / English
- **App event:** `REQUEST_APPROVED` (registry code `WA_REQUEST_APPROVED_V1`)
- **Matching email subject:** Approved: PUR-2026-000123

Body to paste into CEOITBox:
```
Request approved

Your request {{1}}: {{2}} is fully approved.

Details: {{3}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Request approved

Your request PUR-2026-000123: Laptop for the new engineer is fully approved.

Details: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_request_rejected_v1`
- **When:** An approver rejected the request (a reason is always given).
- **Sent to:** The requester
- **Category / language:** Utility / English
- **App event:** `REQUEST_REJECTED` (registry code `WA_REQUEST_REJECTED_V1`)
- **Matching email subject:** Rejected: PUR-2026-000123

Body to paste into CEOITBox:
```
Request rejected

Your request {{1}}: {{2}} was rejected.
Reason: {{3}}

Details: {{4}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | Reason | Budget not available this quarter |
| `{{4}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Request rejected

Your request PUR-2026-000123: Laptop for the new engineer was rejected.
Reason: Budget not available this quarter

Details: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_changes_requested_v1`
- **When:** An approver sent the request back for changes.
- **Sent to:** The requester
- **Category / language:** Utility / English
- **App event:** `CHANGES_REQUESTED` (registry code `WA_CHANGES_REQUESTED_V1`)
- **Matching email subject:** Changes needed: PUR-2026-000123

Body to paste into CEOITBox:
```
Changes needed

An approver asked for changes to {{1}}: {{2}}.
What to change: {{3}}

Update and resubmit it here: {{4}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | What to change | Attach two quotes |
| `{{4}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Changes needed

An approver asked for changes to PUR-2026-000123: Laptop for the new engineer.
What to change: Attach two quotes

Update and resubmit it here: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_request_on_hold_v1`
- **When:** An approver put the request on hold.
- **Sent to:** The requester
- **Category / language:** Utility / English
- **App event:** `REQUEST_ON_HOLD` (registry code `WA_REQUEST_ON_HOLD_V1`)
- **Matching email subject:** On hold: PUR-2026-000123

Body to paste into CEOITBox:
```
Request on hold

Your request {{1}}: {{2}} is on hold.
Reason: {{3}}

Details: {{4}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | Reason (may be a dash) | Waiting for the budget review |
| `{{4}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Request on hold

Your request PUR-2026-000123: Laptop for the new engineer is on hold.
Reason: Waiting for the budget review

Details: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_request_withdrawn_v1`
- **When:** The requester withdrew a request that was waiting for this person.
- **Sent to:** Approvers who still had it pending
- **Category / language:** Utility / English
- **App event:** `REQUEST_WITHDRAWN` (registry code `WA_REQUEST_WITHDRAWN_V1`)
- **Matching email subject:** Withdrawn: PUR-2026-000123

Body to paste into CEOITBox:
```
Request withdrawn

{{1}}: {{2}} was withdrawn by {{3}}, so your approval is no longer needed.

Details: {{4}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | Withdrawn by | Ravi Kumar |
| `{{4}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Request withdrawn

PUR-2026-000123: Laptop for the new engineer was withdrawn by Ravi Kumar, so your approval is no longer needed.

Details: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_request_reopened_v1`
- **When:** The Super Admin reopened an approved request; it goes through approval again.
- **Sent to:** The requester
- **Category / language:** Utility / English
- **App event:** `REQUEST_REOPENED` (registry code `WA_REQUEST_REOPENED_V1`)
- **Matching email subject:** Reopened: PUR-2026-000123

Body to paste into CEOITBox:
```
Request reopened

Your approved request {{1}}: {{2}} was reopened and goes through approval again.
Reason: {{3}}

Details: {{4}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | Reason | Vendor changed the price |
| `{{4}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Request reopened

Your approved request PUR-2026-000123: Laptop for the new engineer was reopened and goes through approval again.
Reason: Vendor changed the price

Details: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_request_comment_v1`
- **When:** Someone commented on a request this person is part of.
- **Sent to:** The requester and everyone with an approval on it
- **Category / language:** Utility / English
- **App event:** `REQUEST_COMMENT` (registry code `WA_REQUEST_COMMENT_V1`)
- **Matching email subject:** New comment on PUR-2026-000123

Body to paste into CEOITBox:
```
New comment

{{1}} commented on {{2}}: {{3}}.

Read and reply here: {{4}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Comment by | Meena Iyer |
| `{{2}}` | Request number | PUR-2026-000123 |
| `{{3}}` | Request title | Laptop for the new engineer |
| `{{4}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
New comment

Meena Iyer commented on PUR-2026-000123: Laptop for the new engineer.

Read and reply here: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_approval_reminder_v1`
- **When:** An approval has passed its response time (working hours).
- **Sent to:** The approver (and their delegate)
- **Category / language:** Utility / English
- **App event:** `APPROVAL_REMINDER` (registry code `WA_APPROVAL_REMINDER_V1`)
- **Matching email subject:** Reminder: PUR-2026-000123 is waiting for you

Body to paste into CEOITBox:
```
Reminder: approval waiting

{{1}}: {{2}} has passed its response time and is still waiting for your decision.

Open it here (sign-in needed): {{3}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Reminder: approval waiting

PUR-2026-000123: Laptop for the new engineer has passed its response time and is still waiting for your decision.

Open it here (sign-in needed): https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_approval_escalated_v1`
- **When:** An approver hasn't acted for twice the response time.
- **Sent to:** The approver's manager and the IT team
- **Category / language:** Utility / English
- **App event:** `APPROVAL_ESCALATED` (registry code `WA_APPROVAL_ESCALATED_V1`)
- **Matching email subject:** Escalation: PUR-2026-000123 is stuck with Manoj Menon

Body to paste into CEOITBox:
```
Approval escalated

{{1}} hasn't acted on "{{2}}" for twice the allowed time.
Request: {{3}}: {{4}}

IT can hand it over if needed: {{5}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Approver | Manoj Menon |
| `{{2}}` | Level | HOD approval |
| `{{3}}` | Request number | PUR-2026-000123 |
| `{{4}}` | Request title | Laptop for the new engineer |
| `{{5}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Approval escalated

Manoj Menon hasn't acted on "HOD approval" for twice the allowed time.
Request: PUR-2026-000123: Laptop for the new engineer

IT can hand it over if needed: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_task_assigned_v1`
- **When:** A work step (e.g. raise the PO after approval) is given to this person.
- **Sent to:** The person who has to do the work
- **Category / language:** Utility / English
- **App event:** `TASK_ASSIGNED` (registry code `WA_TASK_ASSIGNED_V1`)
- **Matching email subject:** Task for you: PUR-2026-000123

Body to paste into CEOITBox:
```
Task for you

There is work for you on {{1}}: {{2}}.
What to do: {{3}}

Open it, do the work, then mark it done: {{4}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | Work | Raise the purchase order |
| `{{4}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Task for you

There is work for you on PUR-2026-000123: Laptop for the new engineer.
What to do: Raise the purchase order

Open it, do the work, then mark it done: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_request_fyi_v1`
- **When:** An FYI step: the request reached a point this person should know about. Nothing to do.
- **Sent to:** The people the FYI step names
- **Category / language:** Utility / English
- **App event:** `REQUEST_FYI` (registry code `WA_REQUEST_FYI_V1`)
- **Matching email subject:** FYI: PUR-2026-000123

Body to paste into CEOITBox:
```
For your information

{{1}}: {{2}} reached "{{3}}".
{{4}}

Nothing to do. Details: {{5}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | Step | Budget booked |
| `{{4}}` | Note (may be a dash) | PO raised |
| `{{5}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
For your information

PUR-2026-000123: Laptop for the new engineer reached "Budget booked".
PO raised

Nothing to do. Details: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_request_resumed_v1`
- **When:** A request on hold is back in progress.
- **Sent to:** The requester and the approvers it waits for
- **Category / language:** Utility / English
- **App event:** `REQUEST_RESUMED` (registry code `WA_REQUEST_RESUMED_V1`)
- **Matching email subject:** Resumed: PUR-2026-000123

Body to paste into CEOITBox:
```
Request resumed

{{1}}: {{2}} is no longer on hold.

Details: {{3}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Request resumed

PUR-2026-000123: Laptop for the new engineer is no longer on hold.

Details: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_request_resubmitted_v1`
- **When:** The requester made the changes this approver asked for.
- **Sent to:** The approver who asked for changes
- **Category / language:** Utility / English
- **App event:** `REQUEST_RESUBMITTED` (registry code `WA_REQUEST_RESUBMITTED_V1`)
- **Matching email subject:** Resubmitted: PUR-2026-000123

Body to paste into CEOITBox:
```
Changes made

{{1}} made the changes you asked for on {{2}}: {{3}}.

Open it here (sign-in needed): {{4}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Raised by | Ravi Kumar |
| `{{2}}` | Request number | PUR-2026-000123 |
| `{{3}}` | Request title | Laptop for the new engineer |
| `{{4}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Changes made

Ravi Kumar made the changes you asked for on PUR-2026-000123: Laptop for the new engineer.

Open it here (sign-in needed): https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_request_deleted_v1`
- **When:** IT removed the person's request (e.g. a test or a mistake).
- **Sent to:** The requester
- **Category / language:** Utility / English
- **App event:** `REQUEST_DELETED` (registry code `WA_REQUEST_DELETED_V1`)
- **Matching email subject:** Removed: PUR-2026-000123

Body to paste into CEOITBox:
```
Request removed

Your request {{1}}: {{2}} was removed by IT.
Reason: {{3}}

Ask IT if you think this is a mistake.

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | Reason | Raised twice by mistake |

What the person sees (with the samples):
```
Request removed

Your request PUR-2026-000123: Laptop for the new engineer was removed by IT.
Reason: Raised twice by mistake

Ask IT if you think this is a mistake.

— ARS Approvals
```

### `ars_request_unblocked_v1`
- **When:** IT fixed the step that was holding up the request.
- **Sent to:** The requester
- **Category / language:** Utility / English
- **App event:** `REQUEST_UNBLOCKED` (registry code `WA_REQUEST_UNBLOCKED_V1`)
- **Matching email subject:** Moving again: PUR-2026-000123

Body to paste into CEOITBox:
```
Request moving again

{{1}}: {{2}} is moving again. IT fixed the step "{{3}}".

Details: {{4}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | Level | Finance approval |
| `{{4}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Request moving again

PUR-2026-000123: Laptop for the new engineer is moving again. IT fixed the step "Finance approval".

Details: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

### `ars_request_blocked_v1`
- **When:** A request can't move on (no approver found, or no path matches).
- **Sent to:** The IT team
- **Category / language:** Utility / English
- **App event:** `REQUEST_BLOCKED` (registry code `WA_REQUEST_BLOCKED_V1`)
- **Matching email subject:** Blocked: PUR-2026-000123

Body to paste into CEOITBox:
```
Request blocked

{{1}}: {{2}} can't move on at "{{3}}" because of: {{4}}.

Please fix it here: {{5}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Request number | PUR-2026-000123 |
| `{{2}}` | Request title | Laptop for the new engineer |
| `{{3}}` | Level | Finance approval |
| `{{4}}` | Why | no eligible approver |
| `{{5}}` | Link to the request | https://approval.arssteels.net/users/requests/123 |

What the person sees (with the samples):
```
Request blocked

PUR-2026-000123: Laptop for the new engineer can't move on at "Finance approval" because of: no eligible approver.

Please fix it here: https://approval.arssteels.net/users/requests/123

— ARS Approvals
```

## Security messages

### `ars_new_login_v1`
- **When:** A sign-in from a new device or browser.
- **Sent to:** The person who signed in
- **Category / language:** Utility / English
- **App event:** `NEW_LOGIN` (registry code `WA_NEW_LOGIN_V1`)
- **Matching email subject:** New sign-in to your ARS-CMS account

Body to paste into CEOITBox:
```
New sign-in

Hi {{1}}, there was a new sign-in to your ARS Approvals account.
When: {{2}}
Device: {{3}}
IP address: {{4}}

If this wasn't you, open this link to sign out everywhere and lock your account: {{5}}

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Person's name | Ravi Kumar |
| `{{2}}` | When | 07 Oct 2026, 10:42 am |
| `{{3}}` | Device | Chrome on Windows |
| `{{4}}` | IP address | 103.21.58.10 |
| `{{5}}` | "This wasn't me" link | https://approval.arssteels.net/api/auth/not-me?t=abc123 |

What the person sees (with the samples):
```
New sign-in

Hi Ravi Kumar, there was a new sign-in to your ARS Approvals account.
When: 07 Oct 2026, 10:42 am
Device: Chrome on Windows
IP address: 103.21.58.10

If this wasn't you, open this link to sign out everywhere and lock your account: https://approval.arssteels.net/api/auth/not-me?t=abc123

— ARS Approvals
```

### `ars_account_locked_v1`
- **When:** Too many wrong passwords locked the account for a while.
- **Sent to:** The account holder
- **Category / language:** Utility / English
- **App event:** `ACCOUNT_LOCKED` (registry code `WA_ACCOUNT_LOCKED_V1`)
- **Matching email subject:** Your ARS-CMS account was locked

Body to paste into CEOITBox:
```
Account locked

Hi {{1}}, your ARS Approvals account was locked for {{2}} minutes after too many wrong passwords.

If this wasn't you, contact IT (itadmin@arssteels.co.in).

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Person's name | Ravi Kumar |
| `{{2}}` | Minutes | 15 |

What the person sees (with the samples):
```
Account locked

Hi Ravi Kumar, your ARS Approvals account was locked for 15 minutes after too many wrong passwords.

If this wasn't you, contact IT (itadmin@arssteels.co.in).

— ARS Approvals
```

### `ars_account_secured_v1`
- **When:** The person pressed "This wasn't me"; every session was ended and the account locked.
- **Sent to:** The account holder
- **Category / language:** Utility / English
- **App event:** `ACCOUNT_SECURED` (registry code `WA_ACCOUNT_SECURED_V1`)
- **Matching email subject:** Your ARS-CMS account was secured

Body to paste into CEOITBox:
```
Account secured

Hi {{1}}, you reported a sign-in that wasn't you. We signed your account out everywhere and locked it.

IT will contact you to unlock it.

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Person's name | Ravi Kumar |

What the person sees (with the samples):
```
Account secured

Hi Ravi Kumar, you reported a sign-in that wasn't you. We signed your account out everywhere and locked it.

IT will contact you to unlock it.

— ARS Approvals
```

### `ars_security_alert_v1`
- **When:** Someone reported a sign-in that wasn't them.
- **Sent to:** The Super Admin
- **Category / language:** Utility / English
- **App event:** `SECURITY_ALERT` (registry code `WA_SECURITY_ALERT_V1`)
- **Matching email subject:** Security: Ravi Kumar reported an unknown sign-in

Body to paste into CEOITBox:
```
Security alert

{{1}} (User ID {{2}}) reported a sign-in that wasn't them. Their account is locked until you unlock it in the Admin Portal.

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Person's name | Ravi Kumar |
| `{{2}}` | User ID | emp1042 |

What the person sees (with the samples):
```
Security alert

Ravi Kumar (User ID emp1042) reported a sign-in that wasn't them. Their account is locked until you unlock it in the Admin Portal.

— ARS Approvals
```

### `ars_super_admin_signin_v1`
- **When:** The Super Admin account signed in.
- **Sent to:** The Super Admin
- **Category / language:** Utility / English
- **App event:** `SUPER_ADMIN_SIGNIN` (registry code `WA_SUPER_ADMIN_SIGNIN_V1`)
- **Matching email subject:** Super Admin sign-in

Body to paste into CEOITBox:
```
Super Admin sign-in

{{1}} signed in as Super Admin.
When: {{2}}
Device: {{3}}
IP address: {{4}}

If this wasn't expected, act now.

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Person's name | Ravi Kumar |
| `{{2}}` | When | 07 Oct 2026, 10:42 am |
| `{{3}}` | Device | Chrome on Windows |
| `{{4}}` | IP address | 103.21.58.10 |

What the person sees (with the samples):
```
Super Admin sign-in

Ravi Kumar signed in as Super Admin.
When: 07 Oct 2026, 10:42 am
Device: Chrome on Windows
IP address: 103.21.58.10

If this wasn't expected, act now.

— ARS Approvals
```

### `ars_break_glass_used_v1`
- **When:** The sealed emergency (break-glass) account signed in.
- **Sent to:** The Super Admin
- **Category / language:** Utility / English
- **App event:** `BREAK_GLASS_USED` (registry code `WA_BREAK_GLASS_USED_V1`)
- **Matching email subject:** Super Admin sign-in

Body to paste into CEOITBox:
```
Emergency account used

The break-glass account {{1}} signed in.
When: {{2}}
Device: {{3}}
IP address: {{4}}

If this wasn't planned, act now.

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Person's name | Ravi Kumar |
| `{{2}}` | When | 07 Oct 2026, 10:42 am |
| `{{3}}` | Device | Chrome on Windows |
| `{{4}}` | IP address | 103.21.58.10 |

What the person sees (with the samples):
```
Emergency account used

The break-glass account Ravi Kumar signed in.
When: 07 Oct 2026, 10:42 am
Device: Chrome on Windows
IP address: 103.21.58.10

If this wasn't planned, act now.

— ARS Approvals
```

### `ars_password_changed_v1`
- **When:** The password was set or changed; every device was signed out.
- **Sent to:** The account holder
- **Category / language:** Utility / English
- **App event:** `PASSWORD_CHANGED` (registry code `WA_PASSWORD_CHANGED_V1`)
- **Matching email subject:** Your ARS-CMS password was changed

Body to paste into CEOITBox:
```
Password changed

Hi {{1}}, your ARS Approvals password was set on {{2}}. You were signed out on every device.

If you didn't do this, contact IT (itadmin@arssteels.co.in).

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Person's name | Ravi Kumar |
| `{{2}}` | When | 07 Oct 2026, 10:42 am |

What the person sees (with the samples):
```
Password changed

Hi Ravi Kumar, your ARS Approvals password was set on 07 Oct 2026, 10:42 am. You were signed out on every device.

If you didn't do this, contact IT (itadmin@arssteels.co.in).

— ARS Approvals
```

### `ars_whatsapp_changed_v1`
- **When:** IT changed the WhatsApp number on the account (sent to the new number).
- **Sent to:** The account holder
- **Category / language:** Utility / English
- **App event:** `WHATSAPP_CHANGED` (registry code `WA_WHATSAPP_CHANGED_V1`)
- **Matching email subject:** Your WhatsApp number was changed

Body to paste into CEOITBox:
```
WhatsApp number changed

Hi {{1}}, the WhatsApp number on your ARS Approvals account was changed by IT.

If you didn't expect this, contact IT (itadmin@arssteels.co.in).

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Person's name | Ravi Kumar |

What the person sees (with the samples):
```
WhatsApp number changed

Hi Ravi Kumar, the WhatsApp number on your ARS Approvals account was changed by IT.

If you didn't expect this, contact IT (itadmin@arssteels.co.in).

— ARS Approvals
```

### `ars_signin_method_changed_v1`
- **When:** IT switched the person between Google sign-in and User ID + password.
- **Sent to:** The account holder
- **Category / language:** Utility / English
- **App event:** `SIGN_IN_METHOD_CHANGED` (registry code `WA_SIGN_IN_METHOD_CHANGED_V1`)
- **Matching email subject:** How you sign in to ARS-CMS has changed

Body to paste into CEOITBox:
```
Sign-in method changed

Hi {{1}}, IT changed how you sign in to ARS Approvals. You now sign in with: {{2}}.

If you didn't expect this, contact IT (itadmin@arssteels.co.in).

— ARS Approvals
```

| Variable | Holds | Sample for Meta |
|---|---|---|
| `{{1}}` | Person's name | Ravi Kumar |
| `{{2}}` | New sign-in method | User ID and password |

What the person sees (with the samples):
```
Sign-in method changed

Hi Ravi Kumar, IT changed how you sign in to ARS Approvals. You now sign in with: User ID and password.

If you didn't expect this, contact IT (itadmin@arssteels.co.in).

— ARS Approvals
```

## Email only

| App event | Email subject | Why no WhatsApp |
|---|---|---|
| `SET_PASSWORD_LINK` | Set your ARS-CMS password | The set-password link goes to the email on record; the WhatsApp code then confirms the number. |
| `USER_INVITED` | You've been added to ARS-CMS | Owner choice (D-166): invitations go by email, with the set-password link for password users. |
| `PASSWORD_RESET_LINK` | Reset your ARS-CMS password | Owner choice (D-166): the reset link goes to the email on record; the WhatsApp code then confirms it. |

## Emails
Every message above is also sent by email from itadmin@arssteels.co.in (through Resend), with the subject shown and the same details as plain text. Emails need no approval: they work as soon as the Resend key is entered in /superadmin/settings.
