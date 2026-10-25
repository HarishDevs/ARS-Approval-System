# Moving ARS-CMS from approval.arssteels.net to arssteels.net

**Goal:** the app (now called **ARS-CMS, Central Management System**) answers on **https://arssteels.net**. The old address keeps working: every old link redirects to the same page on the new one.

**Order:** first add everything the new domain needs **while the old one keeps working** (Steps 1–3). Then switch with one setting (Step 4). Then move the machine callers (Step 5), check (Step 6) and tidy up later (Step 7). At no point is the app off.

**Time:** about 1–2 hours of clicking, plus up to an hour waiting for DNS and SSL. Do it outside office hours: at the switch (Step 4) everyone has to **sign in once more** (sign-ins belong to a domain).

---

## Already done in the app (v1.22.0)
- Visible name **ARS-CMS** (page titles, sign-in, home page, installed app, emails, Pico Bot, privacy policy, terms).
- Every link the app writes (emails, WhatsApp, reports, alerts, calendar) comes from **one** setting, `APP_BASE_URL`. A missing setting now defaults to `https://arssteels.net`.
- **Old-address redirect, off until you turn it on:** set `LEGACY_HOSTS=approval.arssteels.net` and visits to the old address go to the same page on the new one (Step 4). The job runner, provider webhooks and OAuth callbacks are **not** redirected, so they keep working until you move them.
- **Email is unchanged:** the app still sends from `no_reply@approval.arssteels.net`. That domain is verified in Resend, and its DNS records are separate from the website, so email keeps working. Moving the sending address is optional (Step 7).
- **WhatsApp wording is unchanged:** Meta approved the template text with "ARS Approvals", and the app doesn't change approved templates by itself. Resubmit them later if you want the new name in WhatsApp (Step 7).

---

## Before you start: two decisions
1. **What is on arssteels.net today?** If the company website (or the Power BI app) runs on `arssteels.net`, it will be **replaced** by ARS-CMS. Move it first, for example to `www.arssteels.net` or `company.arssteels.net`, or keep ARS-CMS on a different address. Check with: open https://arssteels.net and Cloudflare → `arssteels.net` → **DNS**, looking at the `@` (root) and `www` records.
2. **www:** decide that `www.arssteels.net` should go to `arssteels.net` (recommended), unless it is used for something else.

Write down (password manager) the current values of: GoDaddy app **environment variables**, the Cloudflare **DNS** records for `@`, `www` and `approval`, and the **cron job** command.

---

## Step 1: Connect arssteels.net to the app (GoDaddy and Cloudflare)
The old subdomain stays connected; you are **adding** a domain.

1. GoDaddy → your Node.js app → **Settings → Domains** (or **Connect custom domain**) → **Add** `arssteels.net`. Add `www.arssteels.net` too if offered.
2. GoDaddy shows the record it needs (a CNAME or an A record). In **Cloudflare → arssteels.net → DNS**:
   - **Root (`@`):** replace the current `@` record with the one GoDaddy shows. A CNAME at the root is fine in Cloudflare (it is "flattened"). Keep it **Proxied** (orange cloud), like `approval`.
   - **www:** a CNAME `www` → `arssteels.net`, Proxied.
   - **Do not touch** the `approval` record.
3. **Cloudflare → SSL/TLS:** keep the mode the same as for `approval` (normally **Full (strict)**). **Edge certificates** must cover `arssteels.net` and `www.arssteels.net` (Universal SSL does by default).
4. Wait until GoDaddy shows `arssteels.net` **Connected** and **SSL active**.
5. **Check:** https://arssteels.net shows the ARS-CMS home page with a padlock, and https://approval.arssteels.net still works.
   - If https://arssteels.net says "Direct access is not allowed", you use the origin lock: do Step 2.1 now.

## Step 2: Let the new domain through Cloudflare's rules
1. **Origin lock (if you set `ORIGIN_SECRET`, DEPLOYMENT Part E2):** Cloudflare → **Rules → Transform Rules → Modify Request Header** → open **ARS origin header** → change **when Hostname equals `approval.arssteels.net`** to **Hostname is in** `approval.arssteels.net`, `arssteels.net`, `www.arssteels.net` → **Save**. Without this, the new domain gets "Direct access is not allowed".
2. **WAF skip rules:** Cloudflare → **Security → WAF → Custom rules**. Open **ARS job runner** and any rule for `/api/webhooks/…`. If they also test the hostname, add `arssteels.net`. Rules that test only the URI path need no change.
3. **www → root redirect:** Cloudflare → **Rules → Redirect Rules → Create** → name `www to root`. When Hostname equals `www.arssteels.net`: dynamic redirect to `concat("https://arssteels.net", http.request.uri.path)`, status **301**, **preserve query string** → **Deploy**.
4. **Do not** create a Cloudflare redirect for `approval.arssteels.net`. The app does that itself in Step 4, so machine calls keep working.

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
   - Google may ask to **verify ownership** of `arssteels.net` in Google Search Console (a TXT record in Cloudflare DNS) and may **re-review** the app. Calendar keeps working during a review.
4. **Salesforce:** each org's **External Client App** (UAT now, production later) → **Settings → OAuth Settings → Callback URL**: add a line `https://arssteels.net/api/integrations/salesforce/callback`, keeping the old line → **Save**. The existing connection keeps working; this only matters for **Reconnect**.

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
- **Optional: send email from the main domain:** in Resend add `arssteels.net`, add the DNS records it shows in Cloudflare, wait for **Verified**, then Super Admin → **Providers & security → Email → From address** `no_reply@arssteels.net` → **Test**. Until then email stays on `no_reply@approval.arssteels.net`, which works.
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
