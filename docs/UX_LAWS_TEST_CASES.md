# UX Laws Test Cases

ARS-CMS v1.36.0 (D-234). "Auto" means the case runs on every build in the named test. The result column is filled from the v1.36.0 run, recorded in DEVELOPMENT-MEMORY.md.

| ID | Law | Module | Scenario | Expected result | Actual result | Status | Test |
|---|---|---|---|---|---|---|---|
| UX-01 | 01, 06 | Approvals | Approver types a reason and presses Reject | "Reject this request?" asks; Cancel keeps the request waiting | As expected | Pass | Auto: e2e v137 |
| UX-02 | 01, 06 | Approvals | Approver confirms "Yes, reject" | Request rejected | As expected | Pass | Auto: e2e v137 |
| UX-03 | 09 (validation) | Approvals | Reject with no reason | Refused by the server: "A reason is required." (no dialog) | As expected | Pass | Auto: e2e approval-flow |
| UX-04 | 12, 16 | Approvals | After a decision | "Next waiting for you →" or "Nothing else is waiting" | As expected | Pass | Auto: e2e v137 |
| UX-05 | 24, 09 | Approvals | Open New request (no draft) | First approver is the reporting manager (Manoj Manager) | As expected | Pass | Auto: e2e v137 |
| UX-06 | 07, 17 | Approvals | Open a just-submitted request | Stepper shows exactly one level "current" | As expected | Pass | Auto: e2e v137 |
| UX-07 | 19 | Approvals | Requester opens own request | "← Back to My requests" | As expected | Pass | Auto: e2e v137 |
| UX-08 | 09, 22 | Approvals | "Raise again like this" on a custom request | Custom form with title and approvers copied; banner names the original number | As expected | Pass | Auto: e2e v137 |
| UX-09 | 08 | Search | Quick search "edl 20267" style (no dashes, no leading zeros) | The request is found | As expected | Pass | Auto: e2e v137 + unit ux-laws |
| UX-10 | 08 | Users | WhatsApp "09876543210", "+91 98765 43210", "98765-43210" | All saved as 919876543210 | As expected | Pass | Auto: unit ux-laws |
| UX-11 | 08 | Tasks | Number field "₹ 1,200" | Saved as 1200 | Code change; covered by type check and the field rule | Pass (manual reading) | — |
| UX-12 | 07 | Approvals | Stepper level states (done, current, upcoming, stopped; not-taken path ignored) | Correct state per level | As expected | Pass | Auto: unit ux-laws |
| UX-13 | 01, 10 | Tasks | Delete a My Tasks section, saved search, project field, template or comment | A dialog asks first; Cancel keeps it | Shared ConfirmButton; behaviour follows from the one component | Pass (manual reading) | — |
| UX-14 | 15, 05 | Approvals | Approver opens a request with a budget warning | Warning appears above "Needs your action" | Render order changed; full e2e passes | Pass | Full e2e |
| UX-15 | 01, 14 | Approvals (phone) | Request with the phone decision bar | Pico Bot button sits above the bar | CSS rule on `body[data-decision-bar]` | Pass (manual reading) | — |
| UX-16 | 24 | Lists | Waiting for me / My requests with a default saved view, no filters in the address | Opens the default view | Same redirect as the other lists | Pass (manual reading) | — |
| UX-17 | 22 | Overview | "Overdue for me" tile | Opens the queue filtered to overdue | Link changed to `?show=overdue` | Pass | Full e2e |
| UX-18 | 13 | Tabs, boards | A strip wider than the screen | Shadow on the side with more; none at the end | `.scroll-hint` | Pass (manual reading) | — |
| UX-19 | 04 | Approvals | Press a decision button | That button says "Working…" until the answer | As expected | Pass | Full e2e (decisions) |
| UX-20 | 23 | Tasks, information | Change the new-task or information form, then click a sidebar link | "Leave without saving?" | Same UnsavedGuard as D-233 (tested in v136) | Pass | Auto: e2e v136 (guard) |
| UX-21 | All | Whole app | No sideways scroll at 360–1920 px; axe on main pages light and dark | No findings | As expected | Pass | Auto: e2e v1100-web, v160-ui |
| UX-22 | All | Whole app | Every role's reachable pages, links and downloads | No errors, broken images or sideways scroll | As expected | Pass | Auto: e2e zz-site-audit |
