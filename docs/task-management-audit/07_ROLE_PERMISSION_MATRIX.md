# 07 · Role and permission matrix

## 1. How the proposed roles map to what exists

ARS-CMS has four role codes: `SUPER_ADMIN`, `IT_ADMIN`, `USER`, `EXPORTER` (`database/seeds/001_roles.sql`). Organisational positions are **derived**, not roles. The recommendation is to keep them derived (no duplicate role management) and add a role-to-permission matrix only where a derived position isn't enough.

| Proposed role | Existing construct | Status | Recommendation |
|---|---|---|---|
| Super Admin | `SUPER_ADMIN` (exempt from page and module rules) | Exists | Keep |
| Admin | `IT_ADMIN` (Admin space) | Exists | Keep |
| Department HOD | `departments.hod_user_id` | Partial: HOD analytics scope only | Give HODs department-wide task visibility, department queue, DWR and report access |
| Manager | `users.reporting_manager_id` chain (`teamOf`, `managesAssignee`) | Exists (derived) | Keep derived; acknowledging completion = the assignee's manager (or the assigner) |
| Team Leader | Reporting line | Decided (10 Nov 2026) | **Anyone with direct reports** is a team leader; no new role or structure |
| Employee | `USER` + `module_access` (TASK) | Exists | Keep |

## 2. Proposed permission matrix (✔ allowed, ◐ own team/department only, ✖ not allowed)

| Operation | Super Admin | Admin (IT) | HOD | Manager | Team Leader | Employee | Enforced by (existing / new) |
|---|---|---|---|---|---|---|---|
| View own tasks | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | `canSeeTask` (existing) |
| View team tasks | ✔ | ✔ | ◐ department | ◐ reporting line | ◐ team | ✖ | existing for managers; **new** for HOD department |
| Create task for self | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | type `access` + `mayCreate` (existing) |
| Assign to others | ✔ | ✔ | ◐ | ◐ | ◐ | per type scope | `assignScope` + `mayAssignTo` (existing) |
| Assign to a department | ✔ | ✔ | ◐ own | ✖ | ✖ | ✖ | **new** |
| Reassign / reallocate | ✔ | ✔ | ◐ | ◐ | ◐ | creator only | `allowReassign` (existing) |
| Delegate own task | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (if type allows) | **new** |
| Approve delegation | — | — | — | — | — | — | not needed (owner, 10 Nov 2026) |
| Submit completion | — | — | own | own | own | own | COMPLETE (existing) → SUBMIT (**new**) |
| Acknowledge / reject completion | ✔ | ✔ | ◐ | ◐ (assignee's manager or assigner) | ◐ if chosen | ✖ | **new** |
| Create IDM meeting | ✔ | ✔ | ✔ | ✔ | ✔ | per setting | **new** page key |
| Record minutes / action items | ✔ | ✔ | organiser | organiser | organiser | organiser | **new** |
| Submit DWR | — | — | own | own | own | own | **new** |
| Review DWR | ✔ | ✔ | ◐ department | ◐ reporting line | ◐ team | ✖ | **new** |
| Productivity dashboard | ✔ all | ✔ all | ◐ department | ◐ team | ◐ team | own | analytics scope (existing) + HOD (**partial**) |
| Export Excel/PDF | ✔ | ✔ | per "Can export" | per "Can export" | per "Can export" | per "Can export" | `canExport` / EXPORTER (existing) |
| Configure task types, holidays, rules | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | Admin space (existing) |
| Audit log | ✔ | export by Super Admin | ✖ | ✖ | ✖ | ✖ | `/superadmin/audit` (existing) |

## 3. Restrictions already in place (keep)
- People without the Task module reach only tasks they created, assigned or are assigned to (v1.50.1).
- Page access (Hidden / View / Full) by everyone, department or person applies to every new page once it has a page key.
- Every rule is checked on the server; screens only hide what the server would refuse anyway.
