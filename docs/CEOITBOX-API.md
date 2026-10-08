# CEOITBox API: what the app uses

This is a summary of the owner's master documents for API services (D-076):
- `CEOITBOX_API_Master_Documentation.docx` (the full field-by-field reference);
- `CEOITBOX_API_Integration_Guide.docx`.

Both are dated 8 October 2026 and kept outside the repository. No key, Phone ID secret or password belongs in this file or anywhere in the code.

## Connection
| Item | Where it lives in the app |
|---|---|
| Base URL `https://official.ceoitbox.com` | /superadmin → Providers & security (`whatsapp.ceoitbox_base_url`) |
| API key, sent as the `x-api-key` header | /superadmin → Providers & security, stored encrypted (`whatsapp.ceoitbox_api_key`). Never an env var, never in logs, never shown again after saving |
| Phone ID, sent as `x-phone-id` | Optional while the account has one number (as of 8 Oct 2026). Set it if more numbers are connected |

Use a **separate API key for this app**, named for example "ARS Approvals – prod". Don't reuse the Power BI, Salesforce or Google Sheet keys. Rotate it every 90 days: create a new key, paste it in /superadmin, send a test, switch the old key off, then delete it.

## Endpoints the app calls (`server/integrations/ceoitbox/client.ts`)
| What | Call | Used by |
|---|---|---|
| Send a template message | `POST /api/v1/whatsapp/sendMessage` with `{to, templateName, language, templateVariables[], userMessageId}` | Every notification (`userMessageId` = `ars-n<notification id>`), sign-in codes, test sends |
| Create a template for Meta to approve | `POST /api/v1/messageTemplate/create` with `{name, language, category, components[]}`. BODY carries `{{1}}`… and `example.body_text`; FOOTER is optional | /superadmin/templates → Submit |
| Pull the latest status from Meta | `GET /api/v1/whatsapp/syncTemplatesFromMeta` (empty 200) | /superadmin/templates → Sync status |
| List templates and their status | `POST /api/v1/messageTemplate/getTemplates` with `{pagination{current,pageSize}, order[], search[]}`. Each result's `template` holds Meta's `name, language, category, status, rejected_reason` | Sync status |

## How replies are handled
| Reply | Meaning | App behaviour |
|---|---|---|
| 200 `{id, waMessageId}` | Sent | Delivery recorded as SENT |
| 200 with an `error` object | Blocked before Meta: wallet too low, or the number opted out | `CEOITBOX_BLOCKED`. Not retried; shown in Message deliveries |
| 401 | Key wrong, switched off or deleted | `CEOITBOX_UNAUTHORIZED`. Not retried; fix the key |
| 400 (problem+json) | Meta refused: bad number, wrong template name or language, not approved, wrong variable count | `CEOITBOX_REJECTED`, with Meta's detail. Not retried |
| 5xx, network, timeout | Temporary | Retried with back-off (retry runner, `whatsapp.retry_limit`) |

## Template rules the creator enforces
- Category **Utility** for notifications. Language `en`.
- Names use lowercase letters, numbers and `_`.
- A message can't start or end with a placeholder, and two placeholders can't sit side by side.
- Every placeholder needs a sample.
- At most 1,024 characters. The footer has at most 60 characters and no placeholders.
- Values are sent on one line, cut to 300 characters, and never empty.
- An approved or pending name can't be reused for new wording, so a change becomes `_v2`, `_v3`…
- Meta's statuses:
  - APPROVED: live;
  - PENDING or IN_APPEAL: waiting;
  - REJECTED: shown with the reason;
  - PAUSED or DISABLED: stops sending.

## Not used yet (available when needed)
- Webhooks for delivery and read receipts. They need an HTTPS endpoint that checks a secret header.
- Delivery report by `userMessageId`.
- Media upload.
- Bulk campaigns.
- Contacts.
- Agents.
- Chat assignment.
