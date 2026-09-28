# Asana approval rules — raw notes (reference only)

Source: each project's Customize → Automations panel in Asana, read on 25 Sep 2026. Everything was read only: nothing was edited or saved.
Use: flow reference for the new platform. Per decision D-013 in DEVELOPMENT-MEMORY.md, no Asana data is imported.

## Totals
- 868 rules across 104 projects: 68 on the tier masters, 49 on internal projects, 751 on department copies.
- Each department copy's Automations counter shows one more than its list. The extra item is the master's routing rule, shown under "Related automations".

## MD master (1212762488713471) — 20 rules
- **Bundle "Delay Capture based ontime and overdue" (3 rules):**
  - **Delay Status:** when Task Status changes to Completed, Completion Status = Done on Time✅ if Delay Days < 1, otherwise Done Overdue⏰.
  - **Capture Completed Date:** when the task is completed, Completed Date = today and Task Status = Completed.
  - **Incompletion Status:** when the task is reopened, Task Status is cleared.
- **Task Submitted → comment:** on a form submission in Form Submission, posts "Dear sir, An Approval request has been raised in Asana by {Creator name}." and sets Approval ARS = Submitted.
- **Add to Department Project based on Department:** triggered by the form. Branches for Branding, P&SCM, Sales, MDO, EDO, HR&Admin, IT, FM&T, ASP, Steel Plant, F&A and NBD, each adding the task to "<Dept> - MD Approval Asana" in Form Submission. There is no branch for Corporate Affairs, T&D, Legal or Projects.
- **Change Value Category based on Amount:** triggered by the form. 0 or empty → Zero Value; ≤1,00,000 → Less than 1 Lakh; ≤3,00,000 → 1–3 Lakhs; ≤5,00,000 → 3–5 Lakhs; >5,00,000 → Above 5 Lakhs. Nothing uses the result.
- **Copy of Change Value Category:** the same logic, on a manual trigger.
- **Move approved tasks and update status:** Approval ARS = Approved or Reviewed → Approved Section, Approval Status = Approved or Reviewed.
- **Move Rejected tasks and update status:** Approval ARS = Rejected → **Approved Section** (BUG), Approval Status = Rejected.
- **Move Hold tasks and update status:** Request Changes → Resubmission, Status = Resubmit. Hold → Hold, Status = Hold.
- **Process resubmitted approvals:** Approval ARS = Resubmitted AND section is Rejected, Hold or Resubmission → Status = Resubmitted, due date +1 day, move to Form Submission.
- **Complete task:** when the task moves to Approved Section or Rejected Section.
- **Legacy native-approval rules:**
  - Approved in Form Submission → Approved Section + comment.
  - Rejected → Rejected Section + comment.
  - Changes requested → Hold.
  - Changes requested in Form Submission → Resubmission. This fires together with the rule above, so the task moves to BOTH Hold and Resubmission.
  - Approved in Form Submission → Approved Section. A duplicate rule.
  - In Hold, Approved or Rejected → Approved or Rejected Section.

## ED master — 12 rules
- The tier template below plus the Delay bundle.
- Routing also includes Projects → Project - ED. There is no branch for NBD, CA, T&D or Legal.
- The comment rule fires on "moved to Form Submission".
- No rule reacts to the Approval Status dropdown.

## Tier-master template (Finance, Valarmadhi, SCM, Sumit) — 9 rules, triggered by the native approval
1. Moved to Form Submission → "Dear sir…" comment.
2. Approved in Form Submission → Approved Section + result comment.
3. In Approved Section → complete.
4. Rejected → Rejected Section + comment.
5. In Rejected Section → complete.
6. Changes requested → Hold.
7. In Hold, Approved → Approved Section.
8. In Hold, Rejected → Rejected Section.
9. Form-triggered routing by Department:
   - Routed: Branding, P&SCM, Sales, MDO, EDO, HR&Admin, IT, FM&T, ASP, Steel Plant, F&A.
   - Not routed: Corporate Affairs, even though CA copies exist.
   - Not routed: NBD. Sumit's only user is NBD, so the Sumit routing rule has never run.

## Department copies
- **Template A** (all Finance, Valarmadhi, SCM and Sumit copies, plus ASP-ED): 8 rules on native triggers.
  - They mirror the master's section moves and post a SECOND result comment.
  - "Move completed form submissions to approved" is native Approved → Approved Section. It is harmless here.
- **Template B** (12 ED copies incl. T&D-ED 1212594050009168, and 12 legacy HR copies): 8 rules triggered by the copy's own "Approval Status" dropdown, which nobody sets, so they never run. Sales-ED last ran 27 Dec 2025.
  - They include a "raised" comment rule that uses the token "Task > Creator", which renders as a link instead of the name.
- **Template C** (MD copies, 11–13 rules each):
  - Contents: dropdown-driven section rules, the Delay bundle, and "Move completed form submissions to approved" on TASK COMPLETE.
  - The last rule moves any completed task to Approved and sets Status = Approved. Native rejections also complete the task, so rejected requests show as Approved. BUG: it last ran 2 hours before the read, in P&SCM-MD.
  - P&SCM-MD also has "Process resubmitted approvals".
  - CA-MD and NBD-MD have no comment rule.
  - T&D "ED" 1213324750098201 uses this MD template, so it is an MD-tier project with the wrong name.

## HR Approvals / Admin Approval — 4 rules each (Admin's rules are still named "HR requests")
1. Approved, in Approval Form Submission, Assignee = Srinivasa Raghavan K → HOD Approval, Manager Approval = Approved, mark incomplete, set type Approval, assignee = Subashini.
2. Approved, in HOD Approval, Assignee = Subashini → Approved Section, HOD Approval = Approved.
3. Rejected at either level → Rejected Section, with that level's field = Rejected.
4. Changes requested at either level → Hold Section, with that level's field = Hold.
- The rules check the ASSIGNEE, not the person who clicked Approve.

## Recruitment — same 4 rules with no assignee checks. HOD Subashini.
## Training Dept — same, no checks, HOD Subashini. Never run.
## ASP Internal — 5 rules. Never run.
- Routing by task creator:
  - → Ganesh R: Velmurugan, Fathima, Ramya, Karthic Manoj, Sandhiya, peermohammed.
  - → Divya KP: NirmalKumar, Rajesh P, SatheeshKumar M, premnath.
- HOD Jayaprakash R; the HOD check is assignee = Jayaprakash.
- Approved By = the rule triggerer.
## Plant Internal — 4 rules
- The manager step hands the task to HOD Murthy, but the HOD rule checks assignee = Sivakarthikeyan S. BUG: the task can never complete.
## Branding Approvals — 5 rules
- Routing uses "Nature is X AND Nature is Y" pairs, which can never match on a single-select field. BUG.
- Routes to Sakthivel S / roshan / Joseph Royden F. HOD Sivakarthikeyan S.
## IT Internal — 5 rules
- **Task Assignment:** Approved in HOD Approval with assignee NOT Babulal → Approved Section, reopen, type Task. BUG: it should go to "Assigned To".
- **Approval Done:** assignee Babulal → Approved Section.
- **Task Completed:** watches Assigned To, so it is unreachable.
- Rejected and Hold rules.
## IT Head Approval — 1 rule: form → assign Babulal M. Never run.
## Finance Internal — 6 rules
- **Level-1 assignment by Nature:**
  - Admin / HR / Godown Labour → Anbu
  - Factory / Scrap → Thulasiram D
  - Stores / Godown Reimbursement → rishika.l
  - Freight & Branding → Anupriya Devaraj
  - TA Bills → Srivani M
  - Gold Vouchers & Coins → christypricilla
- **Level 1 approved:**
  - Admin/HR/Godown Labour/Factory/Scrap (assignee Anbu or Thulasiram) → HOD Approval, Valarmadhi, L1 = Approved, L2 = NA.
  - Stores/Godown Reimbursement/Freight (Anupriya or rishika) → 2nd Level, Naveen Kumar G.
  - TA Bills/Gold Vouchers (Srivani or christy) → 2nd Level, Anbu.
- **2nd Level approved** → HOD Approval, Valarmadhi, L2 = Approved.
- **HOD:** Approved → Approved; Changes → Hold; Rejected → Rejected.
- **Rejected / Hold rules** only have branches for Form Submission and HOD. BUG: nothing handles a rejection or hold at 2nd Level.
## Price Realisation — 7 rules
1. Form → create approval SUBTASKS (Ragu, G Chandra Mouli, Gopi K, Prabu) with "Let AI decide number of approvals" on.
2. All subtasks complete, in Pending Approval → ED Approval, assignee Rajesh Bhatia, HOD = Approved, type Approval.
3. Approved in ED Approval → MD Approval, assignee MD, ED status = Approved, reopen. Never run.
4. Task complete in MD Approval → MD = Approved → Approved. Never run.
5. Rejected at ED or MD → Rejected.
6. A duplicate "Handle rejected ED approvals" rule.
7. "Task received" email rule, PAUSED.
