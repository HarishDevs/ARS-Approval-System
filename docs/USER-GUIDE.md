# ARS Approvals: user guide (v1.4.0)

**Address:** https://approval.arssteels.net. Sign in with your company Google account, or with your User ID and password and a WhatsApp code if IT set you up that way. Questions: IT (itadmin@arssteels.co.in).

You are signed out after **2 hours without activity**, and 12 hours after signing in. Anything you were typing in a form is kept; sign in again and carry on.

---

## 1. Everyone

### Raise a request
1. **New request** → pick the approval type (e.g. *Purchase & SCM Approval*).
2. Fill in the form. Add files if needed: up to 5 at a time, 10 MB each (PDF, images, Word, Excel, PowerPoint, CSV, text).
3. **Submit request.** You see its number (e.g. `PUR-2026-000123`), and the first approvers are told by email and WhatsApp.

The **level map** on the request shows every level, who approves, and where it is now. Levels that the amount (DoA) or a rule doesn't need show as *skipped*.

### Custom approval
For something without an approval type: **Custom approval** → title, details, amount (optional), files (optional) → pick who approves:
- **in order:** add a level for each;
- **at the same time:** use *Add parallel steps*;
- **depending on something:** use *Add a choice*.

You can't approve your own request, but you can give yourself a **work task** (e.g. *Raise the PO* after approval).

### When an approver asks for changes
You get a message. Open the request, change the fields or add files, then **Resubmit**. It goes back to the level that asked, or to the first level if the approval type is set that way.

### Withdraw
While it's open: **Withdraw** on the request. The approvers are told.

### Profile
**Profile** in the sidebar (or the menu at the top right):
- **Profile:** your details. Only IT can change them.
- **Notifications:** everything sent to you; *Older →* for earlier ones.
- **Out of office:** name someone to approve for you between two dates (up to 90 days). Both names are recorded on every decision.
- **Sign-in & devices:** how you sign in, your last 10 sign-ins, and **Sign out everywhere** if a phone or laptop was lost.

If you get a *new sign-in* alert that wasn't you, use its **This wasn't me** link. Your account is signed out everywhere and locked until IT unlocks it.

---

## 2. Approvers
**Waiting for me** lists everything that needs you, oldest first, with due times (*Overdue* in red). Open a request, read it, then:
- **Approve.**
- **Ask for changes:** say what to change.
- **Put on hold:** the time on hold doesn't count against your response time.
- **Reject:** give a reason. Rejection is final.

**Work tasks** (marked *To do*) are things to do rather than approve, e.g. raise a PO. Do the work, write what you did, and press **Mark as done**, or **Ask for changes** if something is missing.

**FYI** messages need nothing from you.

If you don't act in time: you get a reminder, then your manager and IT are told, and then your manager's manager.

---

## 3. IT team (Admin space)
- **Users:** add people, set department, designation, reporting manager, roles, sign-in method. Deactivate leavers: *Deactivate user* asks to confirm, then signs them out everywhere. *Hand over* moves someone's pending approvals to another person.
- **Organisation:** departments (with HOD) and designations. Tick **Approver** on designations of Manager and above. Only approver designations can be chosen to approve.
- **Groups:** approver groups (e.g. Finance team) for "any one of the group".
- **Workflows:** each approval type has:
  - **the form:** text, number, date, dropdown, person, or a department/designation list;
  - **the levels:**
    - one step, parallel steps, or a **DoA matrix** (amount bands, with the levels each band needs);
    - **choices** (if / otherwise, up to 3 deep), whose rules can combine conditions with *all of these* or *any one of these*;
  - **who approves:** specific people, the requester's manager or manager's manager, a department HOD, a group, a role, a person picked on the form, **everyone with a designation** (optionally only in the requester's department), or, for work and FYI only, **the requester**;
  - **the kind of step:** *Approval*, *Work task* (marked done) or *FYI* (tells people and moves on);
  - **per step:** a response time, and what to do if nobody resolves (stop and tell IT, or skip).

  Save a draft, check it with **Test mode** (sample values show who would approve), then **Publish**. In *Details*, choose where a resubmitted request restarts, and untick *Open for new requests* to archive a type. **Remove approval type** works only if it was never used.
- **Stuck requests:** if a level finds nobody (e.g. a department has no HOD), IT gets a message, and the request page shows **Stuck: needs IT**. You can:
  - give the step to people;
  - skip it;
  - **Try again** after fixing the master data.

  Your reason is shown on the timeline and to the requester.
- **Calendar:** working days and holidays (used for due times).
- **Import data:** CSV templates for users, departments, designations, groups and holidays. Check first, then import.
- **Dashboards / Insights:** utilisation, by department, by approver, by raiser; CSV download.

---

## 4. Super Admin
- **Providers & security:** Resend (email), CEOITBox (WhatsApp, including the webhook secret), sign-in security, idle sign-out, escalation levels.
- **WhatsApp templates:** write, submit to Meta, sync status (26 messages).
- **Requests:** every request; **Delete** with a reason (the people waiting are told).
- **Message deliveries:** every email and WhatsApp, with retries, the job runner's last run and (with the webhook) DELIVERED and READ.
- **Audit log:** every change; **Download CSV** for a date range.
- **Sign-in history:** every sign-in attempt, with the reason it failed.
- **Overview → Backups:** the last backup; **Back up now**. How to restore: deployment guide, Part P.
