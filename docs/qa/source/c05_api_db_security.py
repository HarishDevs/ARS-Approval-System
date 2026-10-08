SECTIONS.append(("17. API Test Cases", "API", "API", r'''
Attachments | GET /api/attachments/{id} valid | Participant session | 1) GET | — | 200; headers Content-Disposition attachment, X-Content-Type-Options nosniff, Cache-Control private no-store, CSP sandbox | P0 | | Y | R25,S
Attachments | Non-numeric id | Session | 1) GET /api/attachments/abc | — | 404 JSON {success:false, error NOT_FOUND} | P2 | | Y | R25
Attachments | Non-existing id | Session | 1) GET /api/attachments/999999 | — | 404 same body as forbidden | P1 | | Y | R16
Attachments | No session | — | 1) GET | — | 404 (middleware) | P0 | | Y | R16,C
Attachments | Wrong method | Session | 1) POST / DELETE /api/attachments/1 | — | 405; nothing changed | P2 | | Y | R25
Attachments | Path traversal via id | Session | 1) GET /api/attachments/..%2F..%2Fetc | — | 404; storage path never taken from the URL | P0 | Security | Y | R20,C
Jobs | POST /api/jobs/run correct secret | FX-ENV | 1) POST with x-job-secret | — | 200 with a report (retries, reminders, escalations) | P1 | | Y | R07
Jobs | Wrong or missing secret | — | 1) POST without / with wrong secret | — | 401 or 404; nothing processed | P0 | Security | Y | R20,C
Jobs | GET instead of POST | — | 1) GET /api/jobs/run | — | 405 | P3 | | Y | R20
Auth | POST /api/auth/password wrong password | Password user | 1) POST wrong | — | Generic failure (no hint whether the User ID exists); failed_login_count +1; login_logs row | P0 | Security | Y | R29,C
Auth | Lockout after threshold | Password user | 1) 5 wrong passwords | — | Locked 15 min (setting); ACCOUNT_LOCKED alert; correct password refused while locked | P0 | Security | Y | R29,C
Auth | Unknown User ID | — | 1) POST /api/auth/password with unknown id | — | Same generic answer and timing as a wrong password | P1 | Security | P | R29
Auth | OTP wrong or reused | Valid challenge | 1) Wrong code 2) Correct code 3) Reuse it | — | Wrong refused; correct signs in; reuse refused | P0 | Security | Y | R29,C
Auth | OTP expired | Challenge older than validity | 1) Submit code | — | Refused; new code needed | P1 | Security | Y | R29
Auth | Rate limit sign-in | — | 1) 50 attempts in a minute from one IP | — | 429-style refusal after the limit (rate_limit_hits) | P1 | Security | Y | R20,R29
Auth | Forgot password for unknown user | — | 1) POST /api/auth/forgot | — | Same neutral message as for a real user; nothing sent | P1 | Security | Y | R29
Auth | Set-password link reused or expired | Used link | 1) Open again | — | Refused; password unchanged | P1 | Security | Y | R29
Auth | Google token invalid | — | 1) POST /api/auth/google with a fake token | — | Refused; no session | P0 | Security | Y | R29,C
Auth | Google account not created by admin | Valid Google, no user row | 1) Sign in | — | Refused with "not set up" message; no auto-creation | P0 | Security | P | R29,C
Auth | This wasn't me | New-login alert link | 1) Open link | — | All sessions revoked; account locked; Super Admin told SECURITY_ALERT | P1 | Security | P | R29
Auth | Sign out everywhere | Two sessions | 1) POST /api/me/sign-out-everywhere | — | Both sessions revoked | P1 | | Y | R29
Actions | Server Action with malformed FormData | SESS(MGR) | 1) POST decideAction without requestId | — | "Not found."; no change | P2 | | Y | R20
Actions | Server Action with huge payload | SESS(REQ) | 1) POST submit with 60 MB | — | Rejected by the 52 MB body limit; no request | P2 | | Y | R25,R20
Actions | Manipulated requestId/taskKey | SESS(MGR) | 1) POST decide for request X with task of request Y | — | Refused (task not on that request) | P0 | Security | Y | R04,C
Actions | Manipulated workflowId | SESS(REQ) | 1) POST submit with an inactive or custom workflow of someone else | — | Refused; no row | P1 | Security | Y | R01,R16
Actions | SQL injection in fields | SESS(REQ) | 1) Title "x'); DROP TABLE users;--" | — | Stored literally (parameterised queries); tables intact | P0 | Security | Y | R20,C
Actions | XSS in fields and comments | SESS(REQ) | 1) Title/comment "<img src=x onerror=alert(1)>" | — | Rendered as text everywhere (page, email, WhatsApp); no script runs; CSP would block inline anyway | P0 | Security | Y | R20,C
Actions | Cross-site Server Action (CSRF) | Logged in; evil origin page | 1) Form POST from another origin | — | Refused by Next.js origin check; no change | P0 | Security | P | R20,C
Actions | Stale page (old build) action id | After a deploy | 1) Submit a form from a tab opened before deploy | — | Clear error and reload advice; no partial write | P2 | Recovery | N | R18
CEOITBox | sendMessage success | Test key, own number | 1) Template test send | — | Body {id, waMessageId}; delivery SENT with providerReference | P1 | Integration | P | R31
CEOITBox | 401 bad key | Wrong key saved | 1) Sync status | — | "CEOITBox refused the API key (401)…"; nothing changed | P1 | Integration | Y | R31
CEOITBox | 400 Meta rejection | Wrong template name | 1) Send | — | CEOITBOX_REJECTED with Meta detail; not retried | P1 | Integration | Y | R31,R18
CEOITBox | 200 with error object | Simulated | 1) Send | — | CEOITBOX_BLOCKED; not retried | P1 | Integration | Y | R31
CEOITBox | Timeout | Simulated slow reply > timeout | 1) Send | — | CEOITBOX_TIMEOUT after whatsapp.ceoitbox_timeout_ms; retried later | P1 | Integration | Y | R31,R18
CEOITBox | create template payload | Submit | 1) Inspect the outbound body | — | {name, language "en", category, components [BODY text {{n}} + example.body_text [[samples]], FOOTER?]} | P1 | Integration | Y | R31
CEOITBox | getTemplates pagination | > 100 templates at CEOITBox | 1) Sync | — | All pages read (up to 20 × 100); statuses applied by name | P3 | Integration | P | R31
CEOITBox | API key never in URL | Any call | 1) Inspect outbound requests | — | Key only in x-api-key header; never apiKey= in the URL | P0 | Security | Y | R20,R31,C
CEOITBox | Rate limit per minute | whatsapp.ceoitbox_rate_limit_per_minute = 2 | 1) Trigger 3 sends in a minute | — | Third CEOITBOX_RATE_LIMITED, retried later | P2 | | Y | R31
Resend | Email send failure codes | Wrong key | 1) Trigger | — | EMAIL_REQUEST_FAILED / NOT_CONFIGURED logged; business action committed | P1 | Integration | Y | R17
Headers | Security headers on every response | — | 1) curl -I /login, /users, /api/attachments/1 | — | CSP with nonce, X-Frame-Options DENY, nosniff, Referrer-Policy, HSTS, Permissions-Policy, COOP same-origin-allow-popups; no X-Powered-By | P0 | Security | Y | R20,S,C,N
'''))

SECTIONS.append(("18. API Timeout & Retry Test Cases", "Idempotency", "Concurrency", r'''
Submit | Submit retried after a client timeout | SESS(REQ); throttle network so the response is lost | 1) Submit 2) Server commits 3) Browser times out 4) User submits again | — | Expected: one request. Current: a second request is created (no idempotency key): defect risk D-QA-01. Verify count in approval_requests for that title/requester | P0 | | P | R18,C
Submit | Double-click Submit | SESS(REQ) | 1) Double-click Submit request | — | Button disabled after first click ("Working…"); one request | P0 | | Y | R18,C,N
Submit | Two tabs submit the same form | SESS(REQ) | 1) Same data in 2 tabs 2) Submit both | — | Two requests today (no duplicate detection): D-QA-02; decide if a warning is wanted | P1 | | Y | R18
Decide | Approve retried after timeout (processed) | Request at MGR | 1) Approve; drop response 2) Approve again | — | Second attempt refused (task not pending) or "Someone else just changed this request…"; one TASK_DECIDED; one notification | P0 | | Y | R18,R08,C
Decide | Reject retried after 500 | Simulate 500 after commit | 1) Reject 2) Retry | — | One rejection event; second refused | P0 | Recovery | P | R18,C
Withdraw | Withdraw retried | — | 1) Withdraw, lose reply 2) Withdraw again | — | NOT_OPEN on retry; one WITHDRAWN event | P1 | | Y | R18,R24
Resubmit | Resubmit retried | CHANGES_REQUIRED | 1) Resubmit, lose reply 2) Resubmit again | — | Second refused (no longer CHANGES_REQUIRED); round incremented once | P1 | | Y | R18,R11
Attach | Upload retried after timeout | Open request | 1) Attach, lose reply 2) Attach same file again | — | Today: two rows (sha256 equal) are stored: D-QA-03; files never lost | P2 | | Y | R18,R25
Delivery | Delivery retry after 502/503/504 | Simulated provider errors | 1) Trigger 2) Run jobs | — | Retried with back-off 2,4,8… min up to retry_limit; one SENT at most | P1 | Recovery | Y | R18,R17
Delivery | Send succeeded but recording failed | DB fails after provider 200 | 1) Trigger | — | Not marked FAILED, so not resent (notify keeps send and record apart) | P1 | Recovery | P | R18,R17
Delivery | No retry on 400/401 | Provider 400 | 1) Trigger 2) Run jobs | — | Not retried (non-retryable code) | P1 | | Y | R18
Template | Submit template retried | Lost reply after CEOITBox created it | 1) Submit again | — | Second create may fail at CEOITBox as duplicate name; app shows the provider message; sync then finds it (no duplicate rows) | P2 | Integration | P | R18,R31
Jobs | Job runner overlap | Two cron runs overlap | 1) Two POSTs together | — | Reminders claimed once; deliveries retried once (attempt counts consistent) | P1 | | Y | R18,R09
Network | Reconnect mid-session | Offline then online | 1) Go offline 2) Approve 3) Online and retry | — | Clear error while offline; one decision after retry | P2 | | P | R18
'''))

SECTIONS.append(("19. Database Test Cases", "Database", "Database", r'''
Request | Request row correct | Raise | 1) SELECT approval_requests | — | requester_id, workflow_version_id (published), title, form_data_json (typed values), status IN_PROGRESS, round 1, state_version 1, submitted_at | P0 | | Y | R19,C
Tasks | Task rows mirror the engine state | After each decision | 1) Compare approval_tasks to state_json tasks | — | Same ids, statuses, approver, decided_by, comment, round | P0 | | Y | R19,C
Tasks | Due and escalate times | WF-SLA | 1) SELECT due_at, escalate_at | — | Match the working calendar computation | P2 | | Y | R32
Version | state_version increments by one per change | Several actions | 1) Watch state_version | — | +1 per committed action; never skips or repeats | P1 | | Y | R09,R19
Rollback | Failure inside the transaction rolls back | Inject DB error after saveRequestState | 1) Approve | — | Request row, tasks, events all unchanged; no notification sent | P0 | Recovery | P | R19,R17,C
Rollback | Attachment DB insert fails | Inject error | 1) Attach | — | Written files deleted; no rows; clear error | P1 | Recovery | P | R25
Unique | Duplicate request_no impossible | — | 1) INSERT duplicate request_no | — | Unique constraint error | P1 | | Y | R18
Unique | One published version per workflow | — | 1) Try to publish two versions | — | uq_workflow_versions_one_published prevents two | P1 | | Y | R27
Unique | One task key per request | — | 1) INSERT duplicate (request_id, task_key) | — | Rejected | P2 | | Y | R08
FK | Foreign keys | — | 1) Insert a task for a missing request / user | — | FK error | P2 | | Y | R19
Null | Required columns not null | — | 1) Insert request without title | — | Error | P3 | | Y | R19
Users | Users never deleted | — | 1) Deactivate via UI 2) SELECT | — | Row present with active = 0; history keeps names | P1 | | Y | R15
Charset | utf8mb4 round-trip | — | 1) Hindi + emoji title | — | Same bytes back from DB | P2 | | Y | R19
Time | Timestamps in UTC, shown in IST | — | 1) Compare DB and UI | — | DB UTC; UI India time | P2 | | Y | R19
Notifications | notifications and deliveries rows | Event | 1) SELECT | — | One notification per recipient; one delivery per channel with status and failure_code | P1 | | Y | R14,R19
Settings | Secrets stored encrypted | Saved key | 1) SELECT system_settings value | — | AES-GCM ciphertext, never plain | P0 | Security | Y | R20,C
Attach | Stored path not under web root | Attachment | 1) Check UPLOAD_DIR and stored_path | — | Path relative to UPLOAD_DIR, random name, no extension, outside public/ | P0 | Security | Y | R25,C
Templates | Template versions consistent | Creator use | 1) SELECT whatsapp_templates | — | At most one ACTIVE+APPROVED per code; retired older; variables rows in position order | P1 | | Y | R31
Consistency | Status counts = Insights | Data present | 1) SQL counts vs /admin/insights | — | Equal | P2 | | Y | R33
Backup | Restore keeps integrity | Backup and restore staging DB | 1) Restore 2) Open requests | — | All requests, tasks, files (UPLOAD_DIR in backup) consistent | P1 | Recovery | N | R19
DB down | Database unavailable on submit | Stop MySQL | 1) Submit | — | "Couldn't submit. Please try again."; nothing partial; works after restart | P0 | Recovery | P | R17,C
DB down | Database unavailable on approve | Stop MySQL | 1) Approve | — | "Something went wrong…"; task still pending after restart | P0 | Recovery | P | R17,C
'''))

SECTIONS.append(("20. Security Test Cases", "Security", "Security", r'''
Session | Cookie flags | Signed in on HTTPS | 1) Inspect ars_session | — | HttpOnly, Secure, SameSite=Lax, Path=/, 12 h | P0 | | Y | R20,C
Session | Tampered cookie | — | 1) Change one character of the cookie | — | Treated as signed out (HMAC fails) | P0 | | Y | R20,C
Session | Forged uid in cookie payload | — | 1) Edit payload uid, keep signature | — | Rejected | P0 | | Y | R20,C
Session | Revoked session cookie reused | Signed out | 1) Replay old cookie | — | Rejected (server-side session row revoked) | P0 | | Y | R20,C
Session | Session expiry | 12 h old | 1) Use the app | — | Sign-in page | P1 | | Y | R29
Session | Session fixation | — | 1) Set a cookie before sign-in 2) Sign in | — | New session id issued on sign-in | P1 | | P | R20
Authz | Horizontal escalation via requestId | SESS(OUT) | 1) Replay MGR's decide action with own cookie | — | Refused | P0 | | Y | R16,C
Authz | Vertical escalation via roles in the request | SESS(REQ) | 1) Add roles=SUPER_ADMIN to any FormData | — | Ignored; roles only from the DB | P0 | | Y | R30,C
Authz | Hidden field tampering on user form | SESS(IT) | 1) POST user update with roles including SUPER_ADMIN | — | Refused (only SA grants it) | P0 | | Y | R30,C
XSS | Stored XSS in workflow names, field labels, group names | SESS(IT) | 1) Use "<script>alert(1)</script>" in each | — | Shown as text to all users; CSP blocks inline script | P0 | | Y | R20,C
XSS | XSS in attachment file name | — | 1) Upload "<img src=x onerror=alert(1)>.pdf" | — | Name cleaned (<, > removed); shown as text; download header safe | P1 | | Y | R25,R20
XSS | XSS in template wording preview | SESS(SA) | 1) Body with HTML | — | Preview shows text, not HTML | P2 | | Y | R31,R20
Upload | Executable renamed to .pdf | — | 1) Upload MZ… named invoice.pdf | — | "invoice.pdf doesn't look like a real PDF file."; nothing stored | P0 | | Y | R25,C
Upload | HTML or SVG upload | — | 1) Upload page.html / image.svg | — | Type not allowed | P0 | | Y | R25,C
Upload | Polyglot PDF with script | — | 1) Upload a PDF containing JS | — | Accepted as PDF but always downloaded (attachment, sandbox CSP, nosniff); never rendered inline by the app | P1 | | P | R25
Upload | Zip bomb as .xlsx | — | 1) Upload a crafted ZIP .xlsx | — | Stored as-is (≤10 MB), never unpacked by the server | P2 | | N | R25
Upload | Path traversal in file name | — | 1) Upload "../../etc/passwd.txt" | — | Stored name random; display name "passwd.txt" | P0 | | Y | R25,C
Headers | Clickjacking | — | 1) Frame the app in another site | — | Blocked (X-Frame-Options DENY, frame-ancestors) | P1 | | Y | R20
Headers | CSP nonce per request | — | 1) Load twice; compare nonce | — | Different each time; no unsafe-inline for scripts | P1 | | Y | R20
Info | Stack details hidden | Force an error | 1) Trigger a server error | — | Generic message; no stack, SQL or provider names to non-Super-Admins | P0 | | P | R20,C
Info | 404 vs 403 indistinguishable | — | 1) Compare /admin as USER and a random URL | — | Same 404 page (areas not confirmed) | P1 | | Y | R30
Secrets | Secrets absent from the repo and client bundle | — | 1) Grep build output and git for keys | — | Only public Firebase config; no Resend/CEOITBox key, SESSION_SECRET or ENCRYPTION_KEY | P0 | | Y | R20,C
Secrets | Logs don't contain keys or OTPs | — | 1) Trigger failures 2) Read server log | — | No x-api-key, OTP codes, passwords or cookie values | P0 | | P | R20,C
Password | Password hashing | Set password | 1) SELECT password_hash | — | scrypt hash; never plain | P0 | | Y | R29,C
Brute force | OTP brute force | Challenge | 1) 20 wrong codes | — | Challenge locked after the limit; rate limit applies | P0 | | Y | R29,C
Break-glass | Break-glass outside its window | Break-glass account, window closed | 1) Sign in | — | Refused; inside the window: allowed + BREAK_GLASS_USED alert | P1 | | P | R29
Enumeration | User ID enumeration on forgot password | — | 1) Compare replies for real and fake IDs | — | Identical text and similar timing | P1 | | P | R29
Injection | Header injection in email subject | Title with CR/LF | 1) Raise "A\r\nBcc: x@y" | — | Subject one line; no extra headers | P1 | | Y | R20
Injection | Formula injection in future CSV export | — | 1) Title "=HYPERLINK(...)" | — | No export yet; when built, escape leading = + - @ (§42) | P3 | | N | R33
Dependencies | Known vulnerable packages | — | 1) npm audit --production | — | No high or critical issues open | P2 | | Y | R20
TLS | HTTPS only | Live | 1) http:// → | — | Redirect to https; HSTS | P1 | | Y | R20
'''))
