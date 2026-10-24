# AI module: data sources, database and module permissions

## Module permissions

- **Modules:** `APPROVAL`, `TASK`, `INFORMATION`, `AI`. Stored in `users.module_access`, a MySQL SET column whose default is `APPROVAL,TASK,INFORMATION`.
- **Set in:** Admin → Users & roles → Add user / a user's page → **Module access**.
- **Who may change them:**
  - an IT Admin, for staff;
  - the Super Admin only, for another IT Admin;
  - **nobody for themselves**.
- **Saving:** modules are saved only when the form sent them, so edits to other details never change them. Every change is audited with before and after.
- **Enforcement:** inside page access (`checkPageAccess` / `checkPageKey`), so every page, Server Action and API of a module is refused without the module.
  - The sidebar, Ctrl K, the phone bar and the tour hide what's refused.
  - Overview and Calendar show only what the person's modules cover.
  - The **Super Admin is exempt**, as with page access.
- **Migration:** additive (`ALTER TABLE users ADD COLUMN … DEFAULT …`). Everyone keeps today's access, and nobody gains AI.
- **Rollback:** redeploy the previous tag; the old code never reads the column. Dropping it is optional and not needed.

## Database (all additive)

| Migration | Adds |
|---|---|
| `202610240900_ai_module_access.sql` | `users.module_access` |
| `202610241200_ai_assistant.sql` | `ai_conversations`, `ai_messages` (content, provider, model, tokens, time, error, evidence, unverified figures), `ai_proposals`, `ai_sync_runs`, `ai_source_records` |

Settings live in the existing `system_settings` table. The new groups are `AI` and `AI_DATA`; keys are encrypted.

## ARS's own data (live)

- **Tools:** `approvals_waiting_for_me`, `my_requests_summary(period_days ∈ 7/30/90/365)`, `my_tasks_summary`, `my_information_summary`.
- **Scope:** fixed, parameterised SQL, limited to the person asking, and only for modules they have.
- **Freshness:** read live at each question, and labelled "ARS Approvals (live)" with the time read.

## Salesforce (read-only; built, not yet connected)

| Topic | Design |
|---|---|
| Identity | A **dedicated integration user** with a read-only profile and a connected app using the OAuth 2.0 **client credentials** flow. Test in a **sandbox** first. |
| Settings | My Domain URL; consumer key and secret (encrypted); `Object:Field,Field;Object:Field` list; who may ask about it (IT team only by default) |
| Discovery | Not automatic. The owner names the objects and fields after checking them in Setup. Names are checked by pattern, so nothing can be injected into SOQL. |
| Fetch | `SELECT Id, SystemModstamp, <fields> FROM <Object> [WHERE SystemModstamp > <last good checkpoint>] ORDER BY SystemModstamp`, following `nextRecordsUrl` (only Salesforce's own `/services/data/` paths), up to 200 pages per run |
| Store | `ai_source_records` keyed by (source, object, Salesforce Id): repeated or overlapping pages never duplicate |
| Checkpoints | The last **successful** run's newest SystemModstamp. A failed run saves nothing new for that object and doesn't move its checkpoint. |
| Schedule | The AI upkeep job, at most hourly; **Sync now** in AI settings |
| Freshness | Data Sources shows each object's last run, count and error. Over 3 hours without a successful run shows **Stale**. |
| AI access | Tool `salesforce_datasets` (which objects, counts, last sync), for IT only unless set to AI users. Per-object analytics tools come once real fields are known. |
| Limits | API calls per run = 1 token call + one call per page. The Salesforce daily API limit should be checked against the object sizes before enabling hourly runs. |

**Owner's steps:**
1. Create the integration user and the connected app (client credentials, "Run As" the integration user) in a sandbox.
2. Enter the four Salesforce settings, then press **Sync now**.
3. Check the counts on Data Sources.
4. Repeat in production after approval.

## Oracle ERP (designed, not connected)

- **Not reachable from this hosting.** GoDaddy's Node.js hosting can't reach an internal Oracle database, and opening the Oracle listener to the internet is not allowed.
- **Approved pattern:** a small **relay** inside the ARS network that:
  - reads **read-only reporting views** with an approved reporting account;
  - uses bounded, parameterised, batched queries with timeouts;
  - pushes normalised batches **outbound** over HTTPS to an authenticated ARS endpoint (or exposes them through Cloudflare Tunnel);
  - stores them in `ai_source_records` with checkpoints, exactly like Salesforce.
- **Needed from the owner:**
  - the reporting views and the account;
  - a host for the relay;
  - approval of the outbound path.
- The connector framework (runs, checkpoints, records, freshness) is ready for it.

## Power BI datasets (not connected)

The owner chooses which datasets, and provides a read-only service identity. Then it would be added as another source on the same framework.
