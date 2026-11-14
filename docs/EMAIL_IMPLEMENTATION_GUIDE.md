# Email implementation guide (v1.54.8 to v1.54.14)

## What is implemented (VERIFIED by tests)

| Version | Change |
|---|---|
| v1.54.8 | One sender (`server/integrations/email/send.ts`) for every email; providers RESEND / SMTP; hourly limit; Resend fallback; the provider recorded per delivery |
| v1.54.9 | "Send test email" tests the chosen provider alone and shows its error |
| v1.54.10 | SENDMAIL provider (the hosting's mail program) |
| v1.54.11 | 20-second limit per send; `EMAIL_UNCONFIRMED` (never retried, no Resend copy) |
| v1.54.12 | SMTP security **RELAY** (port 25, no TLS, no sign-in) for GoDaddy's script relay |
| v1.54.13 | The test shows the relay's receipt |
| v1.54.14 | **Email diagnostics** panel (see below); **5xx = `EMAIL_REJECTED`** (permanent, not retried); the relay's **queue id** stored with each delivery; Message deliveries shows **Provider** and **ACCEPTED** (not "delivered") |

## The existing queue and statuses, mapped to the brief

The outbox is `notification_deliveries`. It's not rebuilt (the brief asks for no second implementation).

| Brief's status | ARS CMS |
|---|---|
| PENDING / PROCESSING | Not separate states: notify() sends just after the page answers, then records the result. The retry runner leases rows (`leaseDueDeliveries`) so two runners never send the same row |
| ACCEPTED_BY_SMTP | `SENT`, shown as **ACCEPTED** for email (v1.54.14) |
| DEFERRED / RETRY_SCHEDULED | `FAILED` with `next_retry_at` set ("Next try …" in Message deliveries) |
| FAILED | `FAILED` without `next_retry_at` (permanent, or retries used up) |
| DELIVERED | Only from provider receipts (WhatsApp today). **Email is never marked delivered**: SMTP acceptance isn't delivery |

- **Stored per email:** id, recipient, provider, status, provider reference (message id + queue id), attempt count, last attempt, next retry, failure code, payload (for retries).
- **Not stored:** the full SMTP reply of every send. Only the queue id is kept, to avoid storing message details.
- **Retries:** 2, 4, 8 … minutes (the brief suggests 1/5/15/30). Up to "Retries for a failed send". A provider "try later" waits at least 15 min.
- **Duplicates:** idempotency keys (Resend), `X-ARS-Reference` header (SMTP), `EMAIL_UNCONFIRMED` never retried.
- **Rate limit:** "SMTP emails per hour at most" (default 100; GoDaddy allows 500/hour per account).

## Email diagnostics (v1.54.14)

**Where:** Super Admin → Settings → **Email diagnostics** (Super Admin only; 6 runs an hour; every run audited as `EMAIL_DIAGNOSTIC_RUN`).

**What it checks**, from the live server:

| Area | Checks |
|---|---|
| Runtime | Node, Nodemailer, OS, server hostname |
| Settings | Shown without passwords |
| DNS | MX, SPF, DMARC and DKIM of the sending domain; A records of `mail.<domain>`, the hosting server and `relay-hosting.secureserver.net`; the recipient domain's MX; reverse DNS of the hosting server and relay |
| Connections (6 s each, one try) | `localhost:25`; `relay-hosting.secureserver.net:25`; the hosting server on 465 (TLS, certificate checked) and 587; an outside SMTP provider (Brevo) on 587 and 2525 |
| Conversation (reachable relays only, no sign-in) | Greeting, EHLO (STARTTLS/AUTH offered?), MAIL FROM, RCPT TO, then either one test message through the chosen route (DATA, and the final reply with the **queue id**) or RSET |
| Sendmail | Whether the program exists and may be run. It's **not run** |
| Findings | Each marked VERIFIED / LIKELY / UNVERIFIED / BLOCKED BY HOSTING PROVIDER / REQUIRES ADMINISTRATOR ACTION |

**Download report** saves it as text for GoDaddy support.

## Files

- **New:**
  - `server/integrations/email/diagnostics.ts`
  - `features/superadmin/EmailDiagnosticsPanel.tsx`
  - `tests/notifications/email-diagnostics.test.ts`
  - `tests/e2e/v15414-email-diagnostics.spec.ts`
  - the seven `docs/EMAIL_*` and `docs/GODADDY_SUPPORT_REQUEST.md` documents
- **Changed:**
  - `server/integrations/email/smtp.ts` (5xx = rejected)
  - `server/notifications/notify.ts` (`deliveryReference`)
  - `server/settings/test-send.ts`
  - `server/integrations/resend/client.ts` (error codes)
  - `lib/db/repositories/notifications.repository.ts` (provider and reference in the list)
  - `lib/db/repositories/audit.repository.ts` (`countRecentActions`)
  - `app/superadmin/settings/actions.ts` (`emailDiagnosticAction`)
  - `app/superadmin/settings/page.tsx`
  - `app/superadmin/deliveries/page.tsx`
- **Database:** no migration (existing columns).
- **API:** one Server Action, `emailDiagnosticAction(recipient, sendVia: localhost | relay | none)`. Super Admin only; returns `{ text, findings[], id }`. No public endpoint.

## Deploy

1. Publish v1.54.14 (no migration).
2. Super Admin → Settings → Email diagnostics → recipient `itsupport@arsenergy.co.in`, route "Local relay" → **Run diagnostics** → **Download report**.
3. Send the report and docs/GODADDY_SUPPORT_REQUEST.md to GoDaddy.

## Roll back

Publish v1.54.13. Nothing in the database changes, so rolling back is safe. Settings stay as they are.
