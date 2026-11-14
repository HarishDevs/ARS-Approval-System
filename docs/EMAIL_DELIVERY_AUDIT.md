# Email delivery audit (v1.54.14, 14 Nov 2026)

How ARS CMS sends email today, where it can be sent from, and what could make an accepted email go missing.

Every finding is marked with one of these verdicts:

| Verdict | Meaning |
|---|---|
| VERIFIED | Checked directly |
| LIKELY | The evidence points this way |
| UNVERIFIED | Not checked |
| BLOCKED BY HOSTING PROVIDER | The hosting stops it |
| REQUIRES ADMINISTRATOR ACTION | Needs GoDaddy or the Google admin |

No passwords or keys appear in this document.

## 1. Architecture (VERIFIED, from the source)

```text
Application modules ──► notify() / reports / test send
                             │
                             ▼
              server/integrations/email/send.ts   ← the one sender (since v1.54.8)
               │                 │                  │
           RESEND            SMTP (nodemailer)   SENDMAIL (nodemailer)
        HTTPS API (443)    SSL 465 / STARTTLS    /usr/sbin/sendmail
                            587 / RELAY 25
                             │
                             ▼
     notification_deliveries (outbox: status, provider, reference, retries)
```

- **One sender.** All email goes through `sendEmail()` in `server/integrations/email/send.ts`. There are no other Nodemailer transports, and no hard-coded SMTP credentials (VERIFIED: a code search finds no other use of `createTransport`).
- **Settings** are in Super Admin → Settings → Email (`server/settings/definitions.ts`). The password and API key are stored encrypted in the database, never in environment variables or code.
  - This follows the project's fixed rule (CLAUDE.md: provider keys only in `/superadmin` encrypted settings).
  - So the brief's example environment variables (`EMAIL_PROVIDER`, `SMTP_HOST`, …) map to these settings instead.
- **Choices:**
  - Provider: `RESEND`, `SMTP`, `SENDMAIL`.
  - SMTP security: `SSL`, `STARTTLS`, `RELAY` (port 25, no TLS, no sign-in).
  - Optional "connect through" address, hourly limit, Resend fallback (on/off).

## 2. Every place an email is sent from (VERIFIED)

| Entry point | File | Recorded in the outbox | Retried |
|---|---|---|---|
| All notifications: approvals, tasks, meetings, information, sign-in alerts, OTP-related notices, welcome emails, digests | `server/notifications/notify.ts` → `notify()` (sends just after the page answers, via `afterResponse`) | Yes | Yes (retryable codes) |
| Retry runner (cron every 5 min) | `server/jobs/retry-deliveries.ts` | Updates the row | Its own job |
| Weekly HOD report | `server/reports/hod-weekly.ts` | `hod_report_runs` row (SENT/FAILED), not the outbox | No |
| Scheduled reports (with attachment) | `server/reports/schedules.ts` | Report run rows, not the outbox | No |
| Super Admin "Send test email" | `server/settings/test-send.ts` | Yes | No |
| Super Admin "Email diagnostics" (new) | `server/integrations/email/diagnostics.ts` | Audit log only (`EMAIL_DIAGNOSTIC_RUN`) | No |

Sign-in codes (OTP) go **only by WhatsApp** (fixed decision D-006), not email.

## 3. Current settings on live (VERIFIED, from the owner's screenshots, 14 Nov 2026)

- Send email through: **SMTP**
- Server: **localhost**, port **25**, security **RELAY**
- User: `no_reply@cms.arssteels.net`
- Hourly limit: **100**
- Resend fallback: **ON**
- Resend key: set, but its **daily quota is used up** (Resend emails "100% of daily quota").

## 4. Dependencies (VERIFIED)

Node.js ≥ 20 (`engines`), Next.js 15.5.28, Nodemailer **6.9.16**. The Resend API is called with `fetch`.

## 5. Security review

| Item | Status |
|---|---|
| Credentials in code or logs | None. The password is encrypted at rest; errors carry codes and SMTP statuses only (VERIFIED by tests) |
| Header injection | Subjects are flattened to one line; diagnostic addresses must match a strict pattern (no spaces, angle brackets or line breaks) (VERIFIED by tests) |
| Who can test | Only the Super Admin, through server actions that re-check the role; same-site checks in `middleware.ts` |
| Diagnostic abuse | At most 6 runs an hour per person, each audited, with one message at most per run |
| TLS verification | On for SSL/STARTTLS (`rejectUnauthorized` default; `servername` checked even through "connect through"). RELAY uses no TLS by GoDaddy's design: it's a local hop inside the hosting |
| Open relay | The app accepts no inbound SMTP; nothing to open |
| HTML | Notification emails are plain text; no user HTML goes into email |

## 6. Logging (VERIFIED)

- **Failures:** server log line `notify: email failed` with the code (no message body).
- **Every send:** a delivery row with provider, status, failure code and reference. From v1.54.14 the reference includes the relay's **queue id** (`queue 1tXyz… | <message-id>`).
- **Tests and diagnostics:** recorded in the audit log.
- **Fallbacks to Resend:** logged as `email: SMTP not used, sending through Resend`.

## 7. Retries (VERIFIED)

- Retryable codes: `EMAIL_REQUEST_FAILED` (network), `EMAIL_RATE_LIMITED` (4xx or the hourly limit; waits at least 15 min).
- Retries wait 2, 4, 8 … minutes, up to the "Retries for a failed send" setting.
- Not retried:
  - `EMAIL_NOT_CONFIGURED`;
  - `EMAIL_UNCONFIRMED` (it may have gone out);
  - **`EMAIL_REJECTED`** (any 5xx: permanent, new in v1.54.14).

## 8. Duplicate risks

| Risk | Handling |
|---|---|
| Retry after a timeout that did reach Resend | Idempotency key (Resend sends once per key in 24 h) |
| Retry after an SMTP send that went out but answered late | `EMAIL_UNCONFIRMED`: not retried, no Resend copy (v1.54.11) |
| SMTP has no idempotency | The key is sent as `X-ARS-Reference` so copies can be recognised. LIKELY sufficient at this volume |
| The page retried by the user | Each action creates its notification once; the send happens after the answer |
| Weekly HOD and scheduled reports | Claimed per week/run before sending (`INSERT IGNORE`), so a re-run doesn't send again |

## 9. Root-cause candidates for "accepted by localhost:25 but not delivered"

Ranked by probability. The diagnostic and GoDaddy's logs decide between them.

| # | Candidate | Verdict | How to confirm |
|---|---|---|---|
| 1 | GoDaddy's outbound relay holds, filters or drops mail that scripts submit to localhost without sign-in (outbound spam filtering or a sender rule for script mail) | LIKELY | GoDaddy: `exigrep` for the queue id (see GODADDY_SUPPORT_REQUEST.md) |
| 2 | Google refused the email and the bounce went to the cPanel **system account** or the **Default Address**, not to `no_reply@cms.arssteels.net` (the envelope sender of unauthenticated local submissions can be rewritten to the cPanel user) | LIKELY | cPanel → Default Address; webmail of the system account `l3q2wq9555is`; Google Email log search |
| 3 | Google accepted the email but quarantined or filtered it (new sender, no DKIM) | UNVERIFIED | Google Admin → Reporting → Email log search |
| 4 | The relay sends from an IP that SPF for `cms.arssteels.net` doesn't cover | UNVERIFIED (`include:secureserver.net` should cover GoDaddy's relays) | Received headers of a delivered copy, or the Google log |
| 5 | The app's message is malformed | Unlikely: the same code delivered through Resend; Nodemailer builds standard messages; the local stand-in server test checks the SMTP conversation | Diagnostic test message, Gmail "Show original" |
