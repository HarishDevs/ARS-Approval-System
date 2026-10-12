# ARS Approvals: user guide (v1.5.0)

**Address:** https://approval.arssteels.net. Sign in with your company Google account, or with your User ID and password and a WhatsApp code if IT set you up that way. Questions: IT (itadmin@arssteels.co.in).

You are signed out after **2 hours without activity**, and 12 hours after signing in. Anything you were typing in a form is kept; sign in again and carry on.

---

## 1. Everyone

### Overview
The first page (called "My work" before v1.7.1) after signing in. Tiles show what is waiting for you, what is overdue, your open requests and what was sent back. Below are, in order: **due soon / overdue**, **waiting for me**, **returned for changes**, **your drafts**, **your recent requests** and **finished lately**.

### Collaborating, My requests and Waiting for me: filters
- **Collaborating** lists the requests people added you to follow.
- On all three lists, click a quick tab (Open, Sent back, Overdue…) or open **More filters**. You can combine search, status, type, people, step, due dates, files and date ranges.
- Each filter in use shows as a chip; click it to remove it. **Clear all** resets.
- **Save these filters** keeps the combination as a view; you can share it or make it your default.

### Raise a request
1. **New request** → pick the approval type (e.g. *Purchase & SCM Approval*).
2. Fill in the form. Add files if needed: up to 5 at a time, 10 MB each (PDF, images, Word, Excel, PowerPoint, CSV, text).
3. **Submit request.** You see its number (e.g. `PUR-2026-000123`), and the first approvers are told by email and WhatsApp.

**Drafts:** what you type is saved as a draft as you go ("Draft saved 10:42"). If you leave, open it again from **Overview → Your drafts**. **Discard draft** clears it. Files aren't kept in drafts, so add them again before submitting. Drafts are removed when you submit, or after 30 days.

A line above the **level map** says who it's waiting for, since when, and what comes next. The **level map** on the request shows every level, who approves, and where it is now. Levels that the amount (DoA) or a rule doesn't need show as *skipped*.

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

### Find a request
**Search** in the sidebar finds requests you raised, approve(d) or cover for: by number, title or name, with filters for status, type and dates. **Save view** keeps a search for later; make one your default.

### Comments and mentions
Comments can't be edited or removed. To tell someone in particular, type `@` and their User ID (or tap their name under the box). Only people who can already see the request are told; if someone couldn't be told, you see their User ID after posting.

### Download a summary
**Download PDF** at the top of a request: details, levels, who decided what, files and history.

### Help
**Help** in the account menu (your name, top right): how-tos and what each status means. If something goes wrong, use **Copy details for IT** and paste it in your message to IT. It contains a reference IT can look up, and nothing private.

### Profile
**Profile** in the sidebar (or the menu at the top right):
- **Profile:** your details. Only IT can change them.
- **Notifications:** everything sent to you; *Older →* for earlier ones. **Settings** lets you switch off email or WhatsApp for updates on your requests, reminders, comments and FYIs. Approvals waiting for you and security messages always come.
- **Out of office:** name someone to approve for you between two dates (up to 90 days, India dates, whole days). They see what is already waiting and anything new. Both names are recorded on every decision. The page lists what is waiting for you now.
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

**Approve several at once:** on Waiting for me, tick the straightforward approvals (up to 25), press **Review**, check the list, add a comment if you like, and **Yes, approve**. Each one is approved on its own and you see the result for each. Work tasks and requests on hold aren't offered; open them one by one.

If you don't act in time: you get a **due soon** heads-up first, then a reminder, then your manager and IT are told, and then your manager's manager.

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
