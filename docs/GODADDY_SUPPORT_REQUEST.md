# GoDaddy support request: script mail accepted by localhost:25 but not delivered

Copy the text below into GoDaddy support (chat or ticket). **Do not include any password**: support doesn't need it to read the logs.

Before sending:
- run **Super Admin → Settings → Email diagnostics** (route "Local relay (localhost:25)");
- paste the **queue id** and the time from its report where marked;
- attach the downloaded report (.txt).

---

**Product:** Web Hosting (cPanel), primary domain `arssteels.net`
**Server:** `bom1plzcpnl493872.prod.bom1.secureserver.net` (IP `68.178.145.238`)
**cPanel account:** `l3q2wq9555is`
**Application:** Node.js app on this hosting (`approval.arssteels.net`)
**Sender:** `no_reply@cms.arssteels.net` (mailbox created in cPanel)
**Recipient:** `itsupport@arsenergy.co.in` (Google Workspace)
**When:** 14 November 2026, from 3:17 PM IST (09:47 UTC) onwards. Latest test: `<time>`, queue id `<queue id from the report>`.

### What works
- Email sent from **Roundcube** as `no_reply@cms.arssteels.net` is delivered to Google Workspace (SPF pass).
- DNS for `cms.arssteels.net` (managed at GoDaddy):
  - MX → `mail.cms.arssteels.net` (0)
  - A `mail.cms` → `68.178.145.238`
  - SPF `v=spf1 +a +mx +ip4:68.178.145.238 include:secureserver.net ~all`
  - DMARC `p=none`
  - Your team said DKIM isn't required.

### What fails
1. **SMTP to this server on 465 (SSL, mailbox sign-in) from the Node.js app:** `connect EACCES 68.178.145.238:465` (blocked locally; the same server and port work from outside).
2. **`/usr/sbin/sendmail -i -f no_reply@cms.arssteels.net <recipient>` from the app:** didn't finish within 30 seconds; nothing delivered.
3. **Your documented script relay** (`localhost`, port 25, no SSL, no authentication) from the app:
   - the SMTP conversation is **accepted** (250);
   - nothing arrives at the recipient (Inbox or Spam);
   - no bounce arrives in the `no_reply@cms.arssteels.net` inbox.
4. **cPanel Track Delivery shows no records at all,** not even for the Roundcube emails that *were* delivered.

### Live diagnostic findings (14 Nov 2026, ars-diag-20261114-ad64e5d9)
- From the Node.js app, `localhost:25` answers "220 localhost ESMTP Service Ready" and accepts mail with "OK: queued" (no Exim queue id). The app's server name is `b56eb93f682c`, so it runs in a container. **What does this local service do with the mail?** None of it has been delivered, and Track Delivery shows nothing.
- `relay-hosting.secureserver.net:25` ("HOSTING RELAY") is reachable from the app (it sees us as `92.204.214.227`) and accepts our sender and recipient without authentication. Is it supported for this account, and with what limits?

### Please
1. Search the mail log for our messages and tell us what happened to them (relayed, deferred, rejected, held, discarded) and why:
   - `exigrep 'no_reply@cms.arssteels.net' /var/log/exim_mainlog`
   - `exigrep '<queue id>' /var/log/exim_mainlog`
   - Queue: `exim -bp`; for a message id: `exim -Mvh <id>` and `exim -Mvl <id>`
2. Check whether any of these apply to this account:
   - sender verification;
   - outbound spam filtering;
   - relay authorisation for script mail;
   - account sending limits.
   
   If messages are held, release them and allow this sender.
3. Tell us whether mail from `localhost:25` goes through an intermediate outbound relay, and **what Google answered** when it was handed over.
4. Confirm the supported way for a **Node.js** app on this hosting to send mail:
   - `localhost:25`;
   - or `relay-hosting.secureserver.net:25`;
   - or allowing outbound SMTP 465/587 with authentication.
5. Explain why **Track Delivery** (eximstats) records nothing for this account.
6. Tell us where bounces for script mail go, for example the account's system mailbox or the Default Address.

---

**What we can and can't do ourselves:** we have no shell (SSH is off), no WHM, and no access to `exim_mainlog` or the Exim queue. Only GoDaddy can do steps 1–6.
