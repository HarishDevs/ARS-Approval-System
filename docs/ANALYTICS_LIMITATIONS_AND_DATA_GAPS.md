# Analytics limitations and data gaps

Unified prompt Addendum A §16. These numbers aren't shown, or are shown with a caveat, because the data to support them doesn't exist. No figure is estimated or invented.

| Gap | Effect | What would close it |
|---|---|---|
| No plant or business-unit attribute | No plant/BU breakdowns, filters or comparisons | The owner defines plants and maps departments to them |
| No cost-centre attribute | No cost-centre analytics; cost centres can't be amended or auto-filled | A cost-centre master, plus a form field or a user/department mapping |
| No priority field | No priority breakdowns | A priority field on approval types |
| Department is the raiser's **current** one | Moving a person moves their past requests to the new department in analytics | Store the department on the request at submission |
| No request-level due date | Request-level due-date compliance isn't measured. Step response times are (D-122). | A request SLA policy, or a mandatory *needed by* field |
| SLA exists only where a step has a response time | Steps without one are "No response time set" and never overdue | IT sets `slaHours` on steps |
| No SLA exclusions recorded | There is no "SLA excluded" status | An exclusion reason on holds |
| Confirmed duplicates aren't recorded | Only warnings and overrides are counted, never "confirmed duplicates" | A "mark as duplicate" outcome |
| No ERP or external integration | No actual spend, reconciliation or integration-latency figures | An integration |
| No APM, database or deployment telemetry | No API latency, DB load, deployment frequency or availability figures | Hosting monitoring (owner) |
| `job_runs`, `report_runs`, `request_submission_checks` and `request_amendments` start in v1.6.0 | No history before the release | None: history builds up from go-live |
| Budget amounts are whatever IT enters per department and financial year | Budget analytics are only as good as the loaded budgets; "No budget" is shown, never "unlimited" | Finance loads the budgets |
| Aging uses calendar time | Business-day aging isn't shown (SLA status does use working hours) | Add a working-time aging option |
| Live queries, no warehouse | Very large ranges are capped (two years per view, 5,000 rows per report). The figures carry an "As of" time. | A reporting replica, if volumes grow |
| Palette not machine-validated | The dataviz palette validator wasn't available in the build environment. Charts use the existing semantic tokens, with dash, marker and pattern encoding, legends, printed values and a table view, so no chart depends on colour alone. | Run a colour-vision check on the tokens |
