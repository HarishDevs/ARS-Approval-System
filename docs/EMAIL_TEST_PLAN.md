# Email test plan

## Automated (run before every release; no real emails leave the machine)

| Test file | What it proves |
|---|---|
| `tests/notifications/email-smtp.test.ts` (11) | SMTP and SENDMAIL send as the mailbox; one-line subjects; Resend fallback; wrong password is reported, never the password; hourly limit (fallback or wait); 4xx = try later; SENDMAIL needs no password; 20 s limit gives `EMAIL_UNCONFIRMED` (no retry, no Resend copy); RELAY needs no password |
| `tests/notifications/email-relay.test.ts` | Against a stand-in SMTP server: RELAY speaks plain SMTP with no AUTH and no STARTTLS; MAIL FROM is the mailbox; the receipt is returned |
| `tests/notifications/email-diagnostics.test.ts` (7) | Against a stand-in SMTP server: the diagnostic records every step and the queue id; stops at a refused recipient; a closed port is reported, not retried; addresses can't carry commands or headers; findings keep "accepted" apart from "delivered" and label blocked routes; 5xx is permanent; the delivery keeps the queue id |
| `tests/e2e/v15414-email-diagnostics.spec.ts` | The panel is shown to the Super Admin (recipient, three routes, Run); Message deliveries shows Provider; a plain user gets 404 |
| Existing notification, retry and outbox suites | Retries, idempotency, outbox behaviour unchanged |

## On live (manual, controlled recipients only)

| # | Step | Expected | Evidence to keep |
|---|---|---|---|
| 1 | Email diagnostics, route "Don't send" | Connections table: which routes are open (EACCES = blocked by the hosting) | Downloaded report |
| 2 | Email diagnostics, route "Local relay", recipient `itsupport@arsenergy.co.in` | Message accepted with a queue id | Report; queue id |
| 3 | Wait 15 min; check the recipient's Inbox and Spam | Arrives, or not | Gmail "Show original" (SPF/DKIM/DMARC) if it arrives |
| 4 | If it doesn't arrive: Google Admin → Email log search | One of the outcomes A–E in EMAIL_ROOT_CAUSE_ANALYSIS.md | Screenshot |
| 5 | If not at Google: cPanel Default Address and the system account mailbox | Bounce or nothing | Screenshot |
| 6 | Send docs/GODADDY_SUPPORT_REQUEST.md with the queue id | GoDaddy's log result | Their reply |
| 7 | Repeat step 2 with route "GoDaddy relay" (if step 1 shows it reachable) | Accepted / refused | Report |
| 8 | After a fix: Send test email; then a real workflow notification to a test user | Arrives; Message deliveries shows ACCEPTED with the queue id | Screenshots |

**Duplicate check:** after step 8, confirm the recipient got exactly one copy, and that Message deliveries shows one row per email.
