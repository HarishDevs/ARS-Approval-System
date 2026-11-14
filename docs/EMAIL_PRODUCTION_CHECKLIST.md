# Email production checklist

## Before relying on the GoDaddy relay
- [ ] v1.54.14 published.
- [ ] Email diagnostics run on live (route "Local relay"); report downloaded; queue id noted.
- [ ] The test message **arrived** (Inbox or Spam) and Gmail "Show original" shows **SPF: PASS**.
- [ ] If not: Google Email log search result recorded; Default Address and system mailbox checked; GoDaddy support request sent with the queue id (docs/GODADDY_SUPPORT_REQUEST.md).
- [ ] GoDaddy has confirmed in writing which route to use for a Node.js app, and the account's limits.
- [ ] "SMTP emails per hour at most" is set below GoDaddy's account limit (500/hour), with room for other mail on the account (100 recommended).
- [ ] "Use Resend when SMTP fails" is **ON** while the GoDaddy route is unproven.

## DNS (owner, in GoDaddy DNS; no automatic changes)
- [x] MX `cms` → `mail.cms.arssteels.net` (0).
- [x] A `mail.cms` → `68.178.145.238`.
- [x] SPF on `cms`: one record only, `v=spf1 +a +mx +ip4:68.178.145.238 include:secureserver.net ~all`.
- [x] DMARC `_dmarc.cms` `p=none` (remove any trailing space after the address).
- [ ] DKIM for `cms.arssteels.net`. GoDaddy says it isn't required, but it's strongly recommended for Google. Ask again if mail goes to Spam.
- [ ] Don't change `arssteels.net` or `arsenergy.co.in` authentication records.

## Security
- [x] Passwords and keys only in Super Admin (encrypted). Never in chat, code, environment files or logs.
- [x] Diagnostics: Super Admin only, rate-limited, audited.
- [ ] Change the mailbox password if it was ever shared outside cPanel and Super Admin.

## After go-live
- [ ] Message deliveries: emails show **ACCEPTED** with a queue id; no growing number of FAILED rows.
- [ ] Spot-check a real notification arrives (one test user) after each publish.
- [ ] If Resend's daily quota keeps running out, decide on a provider (docs/EMAIL_PROVIDER_COMPARISON.md).

## Roll back
Publish the previous version (no database changes since v1.54.8's settings). If email stops entirely, switch **Send email through** back to **RESEND** in Super Admin.
