# 05 RBAC and permission audit (SEC)

Auditor: SEC · Target: ARS-CMS v1.39.0 (commit `0473f25`). The lead confirmed that the build is v1.39.0 code; `/api/health` says 1.38.0 only because the version string was read before the bump. · Date: 31 Oct 2026 · http://localhost:3100 against `ars_approvals_test`.

## 1. Method

- **Code review:**
  - `server/authorization/{policy,guards,page-access,pages}.ts`, `server/admin/{actor,user-rules}.ts`, `server/auth/{session,try-as}.ts` and `server/modules/task-rules.ts`;
  - `server/work/{access,task-access}.ts` and the object checks in the approval, attachment, collaborator, consult and comment services.
- **Page matrix:** every `/admin/*` (44) and `/superadmin/*` (21) path was listed from `app/`, with route groups removed and `[id]` set to 2. Each was fetched with no session, and as E2E_REQ, E2E_STAFF, E2E_ADMIN and E2E_SUPER.
- **React Server Component (RSC) requests:** the same pages, and every `/users` page, were also fetched with the `RSC: 1` header. That is how the app's client navigation asks for a page.
- **IDOR:** record ids came from read-only SQL (who requested, approves, collaborates, is assigned, owns). They were then fetched as people who are not involved.
- **Server actions:** a static scan of every `"use server"` file (`TEST_EVIDENCE/SEC/actions-scan.mjs` produced `server_actions_inventory.tsv`), plus manual spot checks of object-level checks.
- **Evidence:**
  - `rbac_pages_matrix.txt`
  - `rbac_idor_probes.txt`
  - `rsc_layout_bypass_matrix.txt`
  - `rsc_layout_bypass_excerpts.txt`
  - `superadmin_pages_layout_only.txt`
  - `rsc_module_bypass.txt`
  - `rsc_unauth_users_pages.txt`
  - `api_probes_rerun.txt`
  - `server_action_origin_probe.txt`
  - `server_actions_inventory.tsv`
- **Users:** probes before about 22:52 used the brief's seeded E2E users. The test DB was then re-seeded by another run, so the later probes (RSC matrix, re-runs) used users from the new seed: `it-mvwo934e3` (USER), `it-mvwo932k1` (IT Admin), `itadmin` (Super Admin), `it-mvwo9j8e2` (USER without the TASK and INFORMATION modules).

## 2. The real access model

| Layer | Where | Rule |
|---|---|---|
| 1 Presence | middleware.ts:118-125 | Any `ars_session` cookie lets a request through to the server. Without one, a page redirects to /login and an API answers 404. This layer has no security value on its own. |
| 2 Area (role) | policy.ts:6-23, guards.ts:19-75 | `users`: USER, IT_ADMIN, SUPER_ADMIN. `admin`: IT_ADMIN, SUPER_ADMIN. `superadmin`: SUPER_ADMIN. Being inactive denies all. A wrong role gets a plain 404, and the denial is audited (`AREA_ACCESS_DENIED`, `API_ACCESS_DENIED`). |
| 2b Page access | page-access.ts, pages.ts | The Super Admin sets HIDDEN, VIEW or FULL per page (44 keys) for EVERYONE, a DEPARTMENT or a USER. The most specific rule wins. Landing pages are never hidden. A Server Action or POST counts as a change, so VIEW refuses it. The page comes from an HMAC-signed `x-ars-path` header set by the middleware. Without a valid signature, anyone with restrictions is refused. The Super Admin is exempt. |
| 2c Modules | pages.ts (`module`), page-access.ts:93 | APPROVAL, TASK, INFORMATION and AI per person. A page of a missing module is refused like a hidden page. |
| 3 Record | services | Requests: requester, approver or decider, delegate, consultee, collaborator, or admin (visibility.ts). Tasks: party, the assignee's manager line, a project role, a follower, or admin (task-rules.ts:41, work/access.ts:43-57). Info: recipients and author. Exports, notifications, saved views, templates and drafts are owner-scoped in SQL. |
| Special | session.ts:72-100 | A demo person always acts as USER. A Try-as session is view-only: every write is refused centrally. |
| Roles | types/auth.ts:1 | `SUPER_ADMIN`, `IT_ADMIN`, `USER`, `EXPORTER` (the "Can export" permission, checked by `canExport` on every download route). |

### Permission matrix (area level, observed over HTTP)

| Area / route class | Anonymous | USER (E2E_REQ, E2E_STAFF) | IT_ADMIN (E2E_ADMIN) | SUPER_ADMIN (E2E_SUPER) |
|---|---|---|---|---|
| `/users/*` pages | 307 to /login | 200 (record pages only when involved) | 200 | 200 |
| `/admin/*` pages (44) | 307 to /login ×44 | 404 ×44 (both users) | 200 ×37, 307 ×1 (`/admin/records` to `/admin/records/requests`), 404 ×6 (ids or keys with no record, and `/admin/analytics/list` with no query) | same as IT_ADMIN |
| `/superadmin/*` pages (21) | 307 to /login ×21 | 404 ×21 | 404 ×21 | 200 ×19, 404 ×2 (made-up keys) |
| `/superadmin/*` with `RSC: 1` | redirect without a cookie; **page data with any cookie value** on 4 pages | **page data on 4 pages** | **page data on 4 pages** | 200 |
| `/api/admin/*` | 404 | 404 | 200 (CSV) | 200 |
| `/api/superadmin/audit` | 404 | 404 | 404 | 200 (CSV) |

## 3. Checks

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| RBAC-01 | `/admin/*` without a session | HTTP | PASS | 44 of 44 return 307 to `/login?next=…` (rbac_pages_matrix.txt) |
| RBAC-02 | `/admin/*` as USER (E2E_REQ, E2E_STAFF) | HTTP | PASS | 88 of 88 return 404 (rbac_pages_matrix.txt) |
| RBAC-03 | `/admin/*` as IT_ADMIN | HTTP | PASS | 37×200, 1×307 (by design), 6×404 for absent records |
| RBAC-04 | `/superadmin/*` as USER and IT_ADMIN | HTTP | PASS | 63 of 63 return 404. SUPER gets 19×200 and 2×404 (fake keys). |
| RBAC-05 | `/superadmin/*` with an RSC request as USER, IT_ADMIN, or **without being signed in** (any cookie value) | HTTP | FAIL | `/superadmin/ai/history` (47 table rows: person, conversation title, chat type, time), `/superadmin/ai/reports` (17 rows: usage per person, tokens), `/superadmin/ai/data-sources` (7 rows) and `/superadmin/salesforce` (connected account `integration@ars.test`, setting keys and non-secret values; encrypted values are `null`) are returned with status 200. **SEC-02** |
| RBAC-06 | `/admin/*` with an RSC request as USER | HTTP | PASS | All 44 return only the 404 boundary (4.7-11 KB, 0 rows), because every admin page calls `requireArea("admin")` itself or through its screen. Examples: features/admin/RecordsRegister.tsx:21, dashboards/page-data.ts:12 (rsc_layout_bypass_matrix.txt). |
| RBAC-07 | `/users/*` with an RSC request by someone without the page's module, and by an unauthenticated caller | HTTP | PASS | Task, Information and AI pages give the 404 boundary with no rows (rsc_module_bypass.txt). All 55 user pages with a garbage cookie give 404 boundaries only (rsc_unauth_users_pages.txt). |
| RBAC-08 | Admin APIs as USER | HTTP | PASS | `/api/admin/records/requests`, `/api/admin/import/users`, `/api/admin/workflows/1/export`, `/api/admin/dashboards/utilisation`, `/api/reports/requests` and `/api/analytics/export` all return 404 (rbac_idor_probes.txt) |
| RBAC-09 | Super Admin APIs as IT_ADMIN | HTTP | PASS | `/api/superadmin/audit`: 404 (two datasets). `/api/integrations/salesforce/connect`: 404. As SUPER, `/api/superadmin/audit` is 200 CSV. |
| RBAC-10 | IDOR: `/users/requests/<id>` | HTTP | PASS | As E2E_STAFF, requests 2, 4, 5, 6 and 12 (not involved) are 404, and 1 (collaborator) and 9 (approver) are 200. Request 2 is soft-deleted, so its owner also gets 404 (by design). |
| RBAC-11 | IDOR: `/api/requests/<id>/summary.pdf` and `/users/requests/<id>/amend` | HTTP | PASS | Not involved: 404 (rbac_idor_probes.txt) |
| RBAC-12 | IDOR: `/api/attachments/<id>` | HTTP | PASS | As STAFF, 1, 2 and 3 are 404. 4 is 404 because STAFF was removed as a collaborator (`removed_at` set). The owner gets 200 `image/png` for 2. |
| RBAC-13 | IDOR: `/users/tasks/<id>` | HTTP | PASS | As STAFF, tasks 1, 2 and 18 are 404 and task 15 (assignee) is 200. Task 14 is 200 because STAFF is an EDITOR of project 6, which holds it (D-215, work/access.ts:43-57). As HOD, task 15 is 404. |
| RBAC-14 | IDOR: `/api/files/<id>` | HTTP | PASS | As STAFF, file 1 (task 18 of REQ) is 404, and the attempt is audited (`RECORD_FILE_ACCESS_DENIED`, files route:26). The owner gets 200. |
| RBAC-15 | IDOR: `/users/information/<id>` | HTTP | PASS | As STAFF, item 1 (recipient: REQ only) is 404. The recipient gets 200. |
| RBAC-16 | `/api/exports/<id>` is for its owner only | HTTP | PASS | Export 1 (owner E2E_ADMIN): SUPER gets 404 "Not found, or no longer kept", STAFF gets 404, the owner gets 200 xlsx. |
| RBAC-17 | Another person's AI chat (GET, PATCH, DELETE) | HTTP + SQL | PASS | Re-run after the lead's e2e setup recreated the E2E users. As E2E_SUPER, conversation 2 (owner id 13) gave 404 for GET, PATCH `{"pinned":true}` and DELETE, while the session stayed live before and after. The row is unchanged (`pinned_at` null) (rbac_ai_conversation_rerun.txt). |
| RBAC-18 | Marking notifications read uses only your own ids | HTTP + SQL | PASS | A USER posted ids 1-5 and got `changed:2`. The DB shows only that user's ids 2 and 4 changed. Ids 1, 3 and 5 of another user stayed unread (api_probes_rerun.txt P11b). |
| RBAC-19 | Every exported Server Action has a server-side guard | Code review (static scan) | PASS | 168 exported actions in 42 `"use server"` files. All 168 call `requireApiArea`, `getAdminActor` or a local helper that does (`actor`, `me`, `owner`, `superAdmin`, `userForAi`, `reportUser`). None was found without a guard (server_actions_inventory.tsv). |
| RBAC-20 | Admin actions name their page (G-3), so HIDDEN and VIEW rules apply | Code review | PASS | Every `getAdminActor(...)` call in `app/admin/**/actions.ts` passes a page key, including `PAGE_KEY[kind]` and `PAGE`. |
| RBAC-21 | Super Admin actions use the `superadmin` area | Code review | PASS | Every `requireApiArea(` in `app/superadmin/**/actions.ts` uses `"superadmin"`. |
| RBAC-22 | Client-supplied ids in actions are checked against the record | Code review (spot check) | PARTIAL | Checked about 20 of 168:<br>• `consult` and `answerConsultation` (consult.ts:36,67);<br>• `linkRequests` (consult.ts:93-94);<br>• `addCollaborators` and `removeCollaborator` (collaborators.ts:48,111);<br>• `addComment` (collab.ts:54);<br>• `addAttachments` (attachments/service.ts:76);<br>• saved-view, template, draft and notification updates (SQL `WHERE … AND user_id = ?`);<br>• work views (`mayChangeViews`, work/actions.ts:441-481).<br>No trusted client id was found. The rest were not reviewed one by one. |
| RBAC-23 | An IT Admin can't grant or remove SUPER_ADMIN, change a Super Admin or the break-glass account, or change another IT Admin's contact or modules | Code review | PASS | user-rules.ts:37-80. Over HTTP this is NOT TESTED (it needs the Server Action id). |
| RBAC-24 | Page-access rules (HIDDEN or VIEW) refuse views and changes | Code review | PASS | page-access.ts:114-157, guards.ts:53-63. The test DB had no rules, so this is NOT TESTED over HTTP. |
| RBAC-25 | Try-as session is view-only; an IT Admin can try staff only | Code review | PASS | session.ts:72-80, try-as.ts:27-35. Not exercised over HTTP. |
| RBAC-26 | Server Action posted from another origin | HTTP | PASS | A bogus action from the same origin gives 404 "Server action not found". With `Origin: https://evil.example` it gives 500 with a digest only (Next.js origin check, no stack) (server_action_origin_probe.txt). |
| RBAC-27 | A demo person never has admin rights | Code review | PASS | session.ts:93 |
| RBAC-28 | Earlier review claim S-03 ("anyone may export what they may see") | Code review + HTTP | PASS | Superseded: every download route now also needs `canExport` (exports, reports, records and analytics routes). The re-run as IT Admin got CSV only where the "Can export" check passed. |

**Status counts (28 checks):** PASS 26 (7 by code review only: RBAC-19, 20, 21, 23, 24, 25, 27) · FAIL 1 · PARTIAL 1 · NOT TESTED 0 · BLOCKED 0 · NOT APPLICABLE 0.

SEC-02 was also re-confirmed with the brief's seeded users after the e2e global setup. As E2E_REQ and E2E_ADMIN, the four pages returned 200 RSC payloads with 13, 12, 5 and 0 table rows of Super Admin data (rsc_layout_bypass_excerpts.txt, last block).

## 4. Risks and recommendations

- **Every page must call its own guard.** The project already has this rule (G-1, v1.10.0), but four Super Admin pages break it (SEC-02). Add a lint rule or a unit test that fails when a `page.tsx` under `app/admin` or `app/superadmin` doesn't call `requireArea(...)`, directly or through a screen helper.
- **Prefer data-layer checks.** For example, `listAllConversations` could take the session and require SUPER_ADMIN.
- **Content type.** `POST /api/me/notifications` accepts a `text/plain` body. The cross-site check and `SameSite=Lax` make this safe today, but requiring `application/json` on JSON APIs would add a third layer.

## 5. Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SEC-02 | Super Admin / AI / Salesforce | Super Admin pages AI Activity History, AI Reports, Data Sources, Salesforce Settings | Security (broken access control, information disclosure) | Four Super Admin pages rely only on `app/superadmin/layout.tsx` for access control. With an RSC request (`RSC: 1`, as sent by client navigation), Next.js streams the page segment's data although the layout answers 404. Any signed-in USER or IT Admin, **and an unauthenticated caller who sends any `ars_session` cookie value**, receives Super-Admin-only data. | 404 with no page data for anyone but a Super Admin (D-039; the project's G-1 rule says a layout check alone is not enough). | HTTP 200 RSC payloads containing:<br>• **AI history:** each person's name, conversation title, chat type and time (47 rows);<br>• **AI reports:** usage per person, failures and tokens (17 rows);<br>• **Data sources:** state and sync results (7 rows);<br>• **Salesforce:** connected account `integration@ars.test`, callback URL, setting keys and non-secret values. Encrypted settings show `value:null`, so no secret leaked.<br>A plain HTML GET returns 404 with no rows, but the page title is in the head. | High | P0 | `curl -H "Cookie: ars_session=garbage" -H "RSC: 1" http://localhost:3100/superadmin/ai/history`. The same works with any USER session, and for `/superadmin/ai/reports`, `/superadmin/ai/data-sources` and `/superadmin/salesforce`. | `TEST_EVIDENCE/SEC/rsc_layout_bypass_excerpts.txt`, `rsc_layout_bypass_matrix.txt` (USER and IT_ADMIN rows=47/17/7), `superadmin_pages_layout_only.txt` | `app/superadmin/ai/history/page.tsx`, `ai/reports/page.tsx`, `ai/data-sources/page.tsx` and `salesforce/page.tsx` load data (for example `listAllConversations(200)`) without calling `requireArea("superadmin")`. Next.js renders layouts and pages in parallel, so a layout guard doesn't stop the page segment from being serialised in an RSC response. The middleware only checks that a cookie is present. | Add `await requireArea("superadmin")` at the top of each of the four pages, as the other 17 Super Admin pages do. Add a test that walks `app/admin` and `app/superadmin` and fails on any page with no guard. Optionally re-check the role inside the data functions used only by Super Admin pages. | Open |
