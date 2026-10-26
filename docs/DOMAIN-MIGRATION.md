# Moving ARS-CMS from approval.arssteels.net to arssteels.net

> **Rolled back (26 Oct 2026, D-199).** The owner moved ARS-CMS back to **https://approval.arssteels.net**. The steps below the line are kept for a future move. Do the **Rollback** section now.

## Rollback to approval.arssteels.net (do this now)
State on 26 Oct 2026: the app answers on arssteels.net (v1.22.2); the `approval` DNS record was deleted, so approval.arssteels.net doesn't resolve.

1. **DNS (GoDaddy → arssteels.net → DNS):** **Add** an `A` record, name `approval`, value `160.153.0.150` (the address `www` uses now), TTL 1 hour. If the app's Domains page (next step) shows a different value for approval.arssteels.net, use that instead.
2. **GoDaddy → your Node.js app → Domains:** add `approval.arssteels.net` and make it the **primary** domain. Wait for **Connected** and **SSL active**. Keep `arssteels.net` connected for now (step 3 sends it back to approval). If the app takes only one domain, replace `arssteels.net` with `approval.arssteels.net`.
3. **Environment variables:**
   - `APP_BASE_URL` = `https://approval.arssteels.net` (no trailing slash);
   - `LEGACY_HOSTS` = `arssteels.net,www.arssteels.net` while arssteels.net is still connected, so the links sent out today on arssteels.net open the same page on approval. If you disconnected arssteels.net, leave `LEGACY_HOSTS` empty.
   - Leave everything else as it is. **Publish v1.22.3** (its built-in fallback address is approval.arssteels.net again).
4. **Cron job (cPanel → Cron Jobs):** URL back to `https://approval.arssteels.net/api/jobs/run`, same secret header. Super Admin → **Message deliveries** shows the job runner green within 10 minutes.
5. **CEOITBox:** delivery webhook back to `https://approval.arssteels.net/api/webhooks/ceoitbox`, same secret.
6. **Google Cloud → Google Auth Platform → Branding:** App name `ARS-CMS`; home page `https://approval.arssteels.net`; privacy `https://approval.arssteels.net/privacy`; terms `https://approval.arssteels.net/terms`; authorised domain `arssteels.net` (it covers approval). The Search Console **Domain** property for arssteels.net covers the subdomain. Then resubmit verification.
7. **Nothing to change** at Firebase, the Google Calendar OAuth client or Salesforce if you kept the approval entries (Step 3 below only added). If you removed them, add back: Firebase authorised domain `approval.arssteels.net`; OAuth origin `https://approval.arssteels.net` and redirect `https://approval.arssteels.net/api/integrations/google-calendar/callback`; Salesforce callback `https://approval.arssteels.net/api/integrations/salesforce/callback`.
8. **People sign in once more** on approval.arssteels.net (sign-ins belong to a domain).
9. **Check:** https://approval.arssteels.net shows the ARS-CMS home page; `/api/health` shows `"status":"ok"`, version 1.22.3 and `"jobRunner":"OK"`; Super Admin → **Salesforce Settings** shows the callback on approval.arssteels.net; https://arssteels.net/users/requests/123 lands on the same page at approval (if you set `LEGACY_HOSTS`); sign in with Google and with User ID + WhatsApp code.
10. **Later (optional):** once nothing uses arssteels.net, remove it from the app, clear `LEGACY_HOSTS`, and set the root `@` record back to what you want there (it showed GoDaddy's "Coming Soon" page, `68.178.145.238`).

---

**Goal:** the app (now called **ARS-CMS, Central Management System**) answers on **https://arssteels.net**. The old address keeps working: every old link redirects to the same page on the new one.

**Order:** first add everything the new domain needs **while the old one keeps working** (Steps 1–3). Then switch with one setting (Step 4). Then move the machine callers (Step 5), check (Step 6) and tidy up later (Step 7). At no point is the app off.

**Time:** about 1–2 hours of clicking, plus up to an hour waiting for DNS and SSL. Do it outside office hours: at the switch (Step 4) everyone has to **sign in once more** (sign-ins belong to a domain).

---

## Already done in the app (v1.22.0, v1.22.1)
- Visible name **ARS-CMS** (page titles, sign-in, home page, installed app, emails, Pico Bot, privacy policy, terms).
- Every link the app writes (emails, WhatsApp, reports, alerts, calendar) comes from **one** setting, `APP_BASE_URL`. A missing setting now defaults to `https://arssteels.net`.
- **Old-address redirect, off until you turn it on:** set `LEGACY_HOSTS=approval.arssteels.net` and visits to the old address go to the same page on the new one (Step 4). The job runner, provider webhooks and OAuth callbacks are **not** redirected, so they keep working until you move them.
- **Email is unchanged:** the app still sends from `no_reply@approval.arssteels.net`. That domain is verified in Resend, and its DNS records are separate from the website, so email keeps working. Moving the sending address is optional (Step 7).
- **WhatsApp wording is unchanged:** Meta approved the template text with "ARS Approvals", and the app doesn't change approved templates by itself. Resubmit them later if you want the new name in WhatsApp (Step 7).

---

## Before you start: two decisions
1. **What is on arssteels.net today?** If the company website (or the Power BI app) runs on `arssteels.net`, it will be **replaced** by ARS-CMS. Move it first, for example to `www.arssteels.net` or `company.arssteels.net`, or keep ARS-CMS on a different address. Check with: open https://arssteels.net and GoDaddy → `arssteels.net` → **DNS**, looking at the `@` (root) and `www` records. (Checked 26 Oct 2026: both show GoDaddy's "Coming Soon" page, so nothing is lost.)
2. **www:** decide that `www.arssteels.net` should go to `arssteels.net` (recommended), unless it is used for something else.

Write down (password manager) the current values of: GoDaddy app **environment variables**, the GoDaddy **DNS** records for `@`, `www` and `approval`, and the **cron job** command.

---

## Step 1: Connect arssteels.net to the app (GoDaddy)
**Where the DNS is:** `arssteels.net` uses GoDaddy's name servers (`ns03/ns04.domaincontrol.com`, checked 26 Oct 2026), so all DNS changes are made in **GoDaddy → My Products → arssteels.net → DNS**, not in Cloudflare. Today the root shows GoDaddy's **"Coming Soon"** page (`68.178.145.238`); `approval` points to the Node.js app (`160.153.0.120`, served through GoDaddy's own Cloudflare). The old subdomain stays connected; you are **adding** a domain.

1. GoDaddy → your Node.js app → **Settings → Domains** (or **Connect custom domain**) → **Add** `arssteels.net`. Add `www.arssteels.net` too if offered.
2. GoDaddy shows the record(s) it needs. In **GoDaddy DNS for arssteels.net**:
   - **Root (`@`):** change the `A` record `@` (now `68.178.145.238`, the Coming Soon page) to the value the app shows (often the same address as `approval`, `160.153.0.120`). Remove any **Forwarding** set on the domain.
   - **www:** a `CNAME` `www` → `arssteels.net` (or what the app shows).
   - **Do not touch** the `approval` record or the email records (`MX`, `TXT`, `send`, `resend._domainkey`).
3. Wait until the app shows `arssteels.net` **Connected** and **SSL active** (minutes, up to an hour).
4. **Check:** https://arssteels.net shows the ARS-CMS home page with a padlock (not Coming Soon), https://arssteels.net/privacy shows the privacy policy, and https://approval.arssteels.net still works.

## Step 2: www and the origin lock
1. **www → root:** if the app's Domains page lets you mark `arssteels.net` as the primary domain, do so. Otherwise `www` simply shows the same app; that is fine.
2. **Origin lock (`ORIGIN_SECRET`, DEPLOYMENT Part E2):** this only applies if you put the domain on your **own** Cloudflare account. With GoDaddy name servers it is not in use; leave `ORIGIN_SECRET` unset. If you move the name servers to your own Cloudflare later, follow Part E2 and list both `arssteels.net` and `approval.arssteels.net` in the rule.
3. **Do not** set up a redirect for `approval.arssteels.net` in GoDaddy (Forwarding). The app does that itself in Step 4, so the cron job and webhooks keep working.

## Step 3: Allow the new domain at Google, Firebase and Salesforce
Each step **adds** the new address; keep the old one until Step 7.

1. **Firebase (Google sign-in):** https://console.firebase.google.com → **power-bi-dashboard-3b29f** → **Authentication → Settings → Authorised domains → Add domain** → `arssteels.net`. Add `www.arssteels.net` too if you kept www as a separate site. Without this, Google sign-in fails with `auth/unauthorized-domain` on the new domain.
2. **Google Cloud: the OAuth client for Google Calendar:** https://console.cloud.google.com → the project → **APIs & Services → Credentials** → the OAuth client used for the calendar:
   - **Authorised JavaScript origins:** add `https://arssteels.net`;
   - **Authorised redirect URIs:** add `https://arssteels.net/api/integrations/google-calendar/callback`;
   - **Save** (keep the `approval` entries).
3. **Google Cloud: OAuth consent screen (Google Auth Platform → Branding):**
   - **App name:** `ARS-CMS`;
   - **Application home page:** `https://arssteels.net`;
   - **Privacy policy:** `https://arssteels.net/privacy`;
   - **Terms of service:** `https://arssteels.net/terms`;
   - **Authorised domains:** `arssteels.net` (it covers the subdomain too).
   - Google may ask to **verify ownership** of `arssteels.net` in Google Search Console (a TXT record in GoDaddy DNS; see "Google verification" below) and may **re-review** the app. Calendar keeps working during a review.
4. **Salesforce:** each org's **External Client App** (UAT now, production later) → **Settings → OAuth Settings → Callback URL**: add a line `https://arssteels.net/api/integrations/salesforce/callback`, keeping the old line → **Save**. The existing connection keeps working; this only matters for **Reconnect**.

## Google verification (the OAuth consent screen review)
Google checks the **live** home page and privacy policy. **Submit only after Step 4,** when https://arssteels.net shows ARS-CMS. The first attempt (26 Oct 2026) failed because arssteels.net still showed GoDaddy's "Coming Soon" page: no privacy link, no purpose, `/privacy` not found, and a different name. What each finding needs:

| Google's finding | Fix |
|---|---|
| Home page URL not registered to you | **Google Search Console** (https://search.google.com/search-console, signed in as the **same Google account that owns the Cloud project**) → **Add property → Domain** → `arssteels.net` → copy the **TXT** record → GoDaddy DNS → **Add → TXT**, name `@`, value as shown → **Verify**. A Domain property covers `approval.` and `www.` too. Then wait 24 hours before resubmitting. If another account owns the property, add the project owner as an **Owner** in Search Console → Settings → Users and permissions. |
| Home page has no privacy policy link | Done in the app (bottom of the home page). Needs Step 1 + 4 so arssteels.net shows the app. |
| Privacy policy unresponsive / not enough content | The full policy (data collected, Google Calendar scopes, storage, Limited Use, deletion, contact) is at `/privacy`. It was a 404 only because arssteels.net is still Coming Soon. |
| Home page behind a login | v1.22.2 (D-198): the home page is no longer the sign-in layout; it is a public page about ARS-CMS with a Sign in link. **Publish v1.22.2.** |
| Home page doesn't explain the purpose | v1.22.1 (D-197): the home page now says in plain view, on desktop and phone, what ARS-CMS is for and that it can use Google Calendar. **Publish v1.22.1.** |
| App name doesn't match ("project-408485424707", then "ARS-CMS") | Branding → **App name** = `ARS-CMS`. v1.22.2 shows exactly `ARS-CMS` in the header and as the main heading (before, the most visible brand was the "ARS Green Steel" logo). |
| Logo doesn't identify your brand | Branding → **App logo** → upload `public/brand/ars-logo-120.png` from the repo (120 × 120 PNG, the ARS logo). Or remove the logo: without one, the review is faster and the consent screen shows the name only. |

**Order:** publish v1.22.1 → Steps 1 and 4 (arssteels.net shows ARS-CMS) → Search Console TXT verified → Branding: name, logo, home page `https://arssteels.net`, privacy `https://arssteels.net/privacy`, terms `https://arssteels.net/terms`, authorised domain `arssteels.net` → wait 24 hours → **Verification centre → Prepare for verification / Resubmit**. Check first in a private window that https://arssteels.net and https://arssteels.net/privacy open without signing in.

**If you want to resubmit before moving:** put the Branding links back to `https://approval.arssteels.net`, `…/privacy` and `…/terms` (after publishing v1.22.1, so the site there says ARS-CMS). The Search Console Domain property `arssteels.net` covers that subdomain. Change the links to arssteels.net after the move; Google may re-review.

**Keep the old address connected.** In GoDaddy, `arssteels.net` must be **added** to the app next to `approval.arssteels.net`, not swapped in for it. If GoDaddy's app takes only one domain, ask GoDaddy support to add `approval.arssteels.net` as an extra (alias) domain; until then old links show 404 and anything still calling the old address (cron, CEOITBox) stops working.

## Step 4: Switch (one setting; the old address starts redirecting)
1. GoDaddy → the app → **environment variables / secrets**:
   - `APP_BASE_URL` = `https://arssteels.net` (no trailing slash);
   - **add** `LEGACY_HOSTS` = `approval.arssteels.net`;
   - leave everything else as it is (`ORIGIN_SECRET`, `SESSION_SECRET`, `ENCRYPTION_KEY`, database, …).
2. **Publish / restart** the app.
3. **What changes:**
   - every new email and WhatsApp link points to `https://arssteels.net/…`;
   - opening any old link (`https://approval.arssteels.net/users/requests/123`) lands on the same page at `arssteels.net`;
   - everyone signs in again once on the new domain. Google users press **Continue with Google**; User ID users get their WhatsApp code as usual.
4. **If anything goes wrong:** set `APP_BASE_URL` back to `https://approval.arssteels.net`, remove `LEGACY_HOSTS`, publish. Everything is as before; nothing in the database changes.

## Step 5: Point the machine callers at the new address
They keep working at the old address (the app doesn't redirect them), so there is no rush. Move them on the same day.

1. **Cron job (cPanel → Cron Jobs):** change the URL in the command to `https://arssteels.net/api/jobs/run` and keep the secret header. Test it (DEPLOYMENT Part I, I2): Super Admin → **Message deliveries** shows "Job runner: last ran N min ago" within 10 minutes. If you use the Cloudflare Worker instead (I8), change its URL.
2. **CEOITBox (WhatsApp receipts):** set the delivery/read webhook to `https://arssteels.net/api/webhooks/ceoitbox`, same `x-webhook-secret`.
3. **Google Calendar push:** nothing to do. Each person's calendar watch renews itself on the new address within about a week; until then Google still calls the old address, which the app keeps serving.
4. **Salesforce:** nothing to do. Reconnect only if Salesforce asks (Super Admin → **Salesforce Settings**; the callback shown there is now the new one).

## Step 6: Check (15 minutes)
- [ ] https://arssteels.net shows the ARS-CMS home page; the browser tab reads "ARS-CMS | ARS Steels"; there is a padlock.
- [ ] https://www.arssteels.net and https://approval.arssteels.net/login both end up on `https://arssteels.net/…`.
- [ ] An old email link (e.g. `https://approval.arssteels.net/users/requests/<a real number>`) opens that request after sign-in.
- [ ] **Sign in with Google** and with **User ID + WhatsApp code** both work on the new domain.
- [ ] `https://arssteels.net/api/health` shows `"status":"ok"` and the new version.
- [ ] Raise a test request: the approver's email and WhatsApp links start with `https://arssteels.net/`.
- [ ] Super Admin → **Message deliveries:** job runner green; a new email delivered.
- [ ] Profile → Calendar: **Connect Google Account** works (Step 3.2).
- [ ] Super Admin → **Salesforce Settings → Test connection** passes.
- [ ] Pico Bot answers a question.
- [ ] On a phone: open https://arssteels.net, sign in, open the menu. If people installed the app on their phone, they **re-install** it from the new address (the old icon opens the old address and redirects).

## Step 7: Later (after 30–90 days)
- **Keep `approval.arssteels.net` connected and `LEGACY_HOSTS` set for a long time** (at least a year): old emails, WhatsApp messages, PDFs and bookmarks still carry the old links. It costs nothing.
- **Remove the old entries** you kept in Steps 3.2 and 3.4 only once nothing uses them. The Firebase authorised domain can stay.
- **Optional: send email from the main domain:** in Resend add `arssteels.net`, add the DNS records it shows in GoDaddy DNS, wait for **Verified**, then Super Admin → **Providers & security → Email → From address** `no_reply@arssteels.net` → **Test**. Until then email stays on `no_reply@approval.arssteels.net`, which works.
- **Optional: the new name in WhatsApp:** resubmit the WhatsApp templates in Super Admin → **WhatsApp templates** with "ARS-CMS" instead of "ARS Approvals". Meta reviews them; the old approved ones keep being used until the new ones are approved.
- **Settings that may still say "ARS Approvals"** (if they were saved before): Super Admin → **Providers & security → General → Application name** and **Email → From name**. Set both to `ARS-CMS`.
- **Calendar event text:** if you customised the calendar description in Super Admin → Integrations → Google Calendar, replace "ARS Approvals" there.

---

## Rollback at any point
| After | Undo |
|---|---|
| Steps 1–3 | Nothing to undo: they only add. |
| Step 4 | `APP_BASE_URL` back to `https://approval.arssteels.net`, remove `LEGACY_HOSTS`, publish. |
| Step 5 | Put the old URLs back in the cron job and CEOITBox (or leave them: the old address still serves them). |
