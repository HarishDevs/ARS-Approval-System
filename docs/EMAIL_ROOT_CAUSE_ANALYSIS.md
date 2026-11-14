# Email root cause analysis (14 Nov 2026)

## RESOLVED (14 Nov 2026, 4:51 PM IST)

**Root cause (VERIFIED):**
- GoDaddy runs the Node.js app in a **container** (server name `b56eb93f682c`, leaving GoDaddy from `92.204.214.227`).
- In that container, `localhost:25` is a small local mail service that accepts every email ("OK: queued") but never hands it to GoDaddy's mail system.
- So the emails silently went nowhere: no delivery, no bounce, nothing in cPanel Track Delivery (which only sees cPanel's Exim).

**Fix (VERIFIED):**
- Super Admin → Email: Send email through **SMTP**, server **`relay-hosting.secureserver.net`**, port **25**, security **RELAY** (no password).
- GoDaddy's "HOSTING RELAY" accepted the app's test email ("250 2.0.0 SBo0xUPmLhTTXSBo0xmMGL mail accepted for delivery").
- It arrived in the Inbox of `itsupport@arsenergy.co.in` as "ARS CMS <no_reply@cms.arssteels.net>".
- SPF covers the relay (`132.148.124.47` is in `include:secureserver.net`).

**Side finding:** the diagnostic's own hand-built test message was refused by the relay ("552 bare LF"). Fixed in v1.54.15: it's now built by the same email library.

The analysis below is kept as the record of how this was found.

---


**Status: the final failure point is not yet confirmed.** Everything up to "the local relay accepted the email" is verified. What happens after that can only be seen in GoDaddy's mail log or the recipient's mail log. Neither is accessible to the application or to me. This document says exactly what is known, how it is known, and how to close the gap.

## Update: live diagnostic ars-diag-20261114-ad64e5d9 (14 Nov 2026, 16:45 IST)

| Finding | Evidence | Verdict |
|---|---|---|
| **`localhost:25` is not cPanel's Exim.** It's a small mail service inside the app's own container | Greeting "220 localhost ESMTP Service Ready"; replies "Roger, accepting mail from…", "I'll make sure … gets this", "OK: queued" with **no queue id**; app server name `b56eb93f682c` (a container id) | LIKELY (very strong) |
| **That explains all the symptoms:** mail is accepted, never arrives, no bounce, and Track Delivery is empty (it only sees cPanel's Exim) | As above, plus the empty Track Delivery | LIKELY |
| **The app leaves GoDaddy from `92.204.214.227`,** not the hosting IP `68.178.145.238` | The GoDaddy relay greeted it as `[92.204.214.227]` | VERIFIED |
| **`relay-hosting.secureserver.net:25` is GoDaddy's real relay and is open to the app** | "HOSTING RELAY : ESMTP Grid hosting relay server ready"; **sender and recipient accepted without a password**; STARTTLS offered | VERIFIED (no message sent through it yet) |
| **SPF covers that relay** | Relay IP `132.148.124.47` (PTR p3nlsmtp01-v01.prod.phx3.secureserver.net) is in `include:secureserver.net` → `spf-0.secureserver.net` → `ip4:132.148.124.0/24` | VERIFIED |
| **Every other SMTP route is blocked:** hosting server 465/587 (EACCES), outside provider 587 (EACCES), 2525 (timeout) | Diagnostic connections table | BLOCKED BY HOSTING PROVIDER |
| **No DKIM** for cms.arssteels.net | `default._domainkey` not found | VERIFIED |

**Conclusion (LIKELY, to confirm with one test):** the Node.js app runs in a container whose `localhost:25` accepts mail but doesn't hand it to GoDaddy's real mail system. The fix is to send through `relay-hosting.secureserver.net:25` (RELAY), which is open to the app and covered by SPF.

## Timeline of evidence

| When (IST) | Route | Result | Verdict |
|---|---|---|---|
| 13–14 Nov | Roundcube webmail as `no_reply@cms.arssteels.net` (signed in) | **Delivered** to Gmail Inbox; Gmail shows "mailed-by cms.arssteels.net" (SPF pass); no "signed-by" (no DKIM) | VERIFIED |
| 14 Nov | App → hosting mail server :465 SSL, signed in | `connect EACCES 68.178.145.238:465`; the same server and port work from outside (valid TLS, Exim, AUTH offered) | BLOCKED BY HOSTING PROVIDER |
| 14 Nov | App → `/usr/sbin/sendmail -i -f no_reply@…` | Didn't finish within 30 s; nothing delivered | VERIFIED (outcome); cause UNVERIFIED |
| 14 Nov, 3:17 pm onwards | App → `localhost:25`, no TLS, no sign-in (GoDaddy's documented route) | SMTP conversation **accepted**; nothing in the recipient's Inbox or Spam; no bounce in the `no_reply` inbox | VERIFIED (accepted); delivery not confirmed |
| 14 Nov | cPanel Track Delivery | **No records at all**, even for the delivered Roundcube mail | VERIFIED |

## Where the failure can be

```text
App ──(1)──► localhost:25 (Exim on the hosting) ──(2)──► GoDaddy outbound relay ──(3)──► Google MX ──(4)──► mailbox
         accepted (VERIFIED)           ?  not visible                         ?               ?  Inbox/Spam: not there
```

- **Hop 1 is fine.** VERIFIED: the relay answered 250 to the message.
- **Hops 2 and 3** are inside GoDaddy. The app can't see them; only `exim_mainlog` can (REQUIRES ADMINISTRATOR ACTION: GoDaddy).
- **Hop 4** is inside Google. Only Google Admin → Email log search can show it (REQUIRES ADMINISTRATOR ACTION: Google Workspace admin of `arsenergy.co.in`).

## Most likely causes

See the ranked table in EMAIL_DELIVERY_AUDIT.md §9. In short:
1. **LIKELY:** GoDaddy's outbound relay filters or holds unauthenticated script mail.
2. **LIKELY:** Google refused the email and the bounce went to the cPanel system account or the Default Address, not to `no_reply@`.
3. **UNVERIFIED:** Google quarantine or spam handling.

## How to close the gap (in order)

1. **Publish v1.54.14** and run **Super Admin → Settings → Email diagnostics** ("Local relay (localhost:25)"), recipient `itsupport@arsenergy.co.in`. The report records every SMTP reply and the relay's **queue id**. Download it.
2. **Check where a bounce would land:**
   - cPanel → **Default Address** (which address catches unrouted mail for `cms.arssteels.net`);
   - the cPanel **system account** mailbox (`l3q2wq9555is`) in webmail.
3. **Google admin of `arsenergy.co.in`:** Admin console → Reporting → **Email log search**, sender `no_reply@cms.arssteels.net`, today. It distinguishes:

| Outcome | What the Email log search shows |
|---|---|
| A. Google never received it | No entry at all, so the problem is at GoDaddy |
| B. Received and rejected | Entry with "Rejected" and the SMTP reason |
| C. Accepted and quarantined | Entry with "Quarantined" (admin quarantine) |
| D. Accepted as spam | Entry delivered to Spam (check the folder) |
| E. Delivered elsewhere | Entry delivered to another route or folder (routing rules) |

4. **GoDaddy:** send docs/GODADDY_SUPPORT_REQUEST.md with the queue id from step 1.

## Answers to the brief's questions (as of now)

1. **Confirmed root cause:** not confirmed yet. Hop 1 accepts. The loss is at hop 2, 3 or 4, and only GoDaddy's or Google's logs can say which.
2. **Is `localhost:25` suitable?** It's the route GoDaddy documents for scripts, and it accepts our mail (VERIFIED). It's suitable **only once GoDaddy confirms it delivers.** Limits: 500 a day per sender, 500 an hour per account.
3. **Is `relay-hosting.secureserver.net:25` accessible?** UNVERIFIED. The diagnostic checks DNS, connection and a full conversation from the server.
4. **Why is 465 blocked?** The hosting refuses outgoing SMTP connections from the app's processes (`EACCES` is a local refusal, not the remote server). Shared cPanel hosting commonly blocks user processes' outbound SMTP so mail goes through its own relay. GoDaddy's exact rule is UNVERIFIED (ask support).
5. **Why aren't messages reaching Google Workspace?** Not confirmed. See the three likely causes above.
6. **Why is Track Delivery empty?** UNVERIFIED. It's empty even for delivered Roundcube mail, so delivery tracking isn't working for this account (GoDaddy may not record mail statistics on this server, or uses a separate outbound cluster). Ask GoDaddy.
7. **Immediate fix:** keep the Resend fallback ON (it delivers whenever its daily quota allows). Run the diagnostic and send GoDaddy the queue id. If an outside SMTP port is reachable (the diagnostic checks Brevo on 587/2525), an SMTP provider becomes possible; if not, only an HTTPS-API provider will work (see EMAIL_PROVIDER_COMPARISON.md).
8. **Long-term architecture:** the existing single sender + outbox, with **an HTTPS-API transactional provider as the main route** (outbound SMTP is blocked; HTTPS works) and the GoDaddy relay as a fallback once GoDaddy confirms it delivers.
9. **What's implemented:** see EMAIL_IMPLEMENTATION_GUIDE.md.
10. **Pending with GoDaddy:** see GODADDY_SUPPORT_REQUEST.md.
