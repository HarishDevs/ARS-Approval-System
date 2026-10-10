# Analytics test matrix

Unified prompt Addendum A §22. Every row names the automated test that covers it.

| Area | Case | Test |
|---|---|---|
| Semantics | No response time → never overdue | unit `tests/analytics/semantics.test.ts` (SLA status) |
| Semantics | Within, approaching at 75 %, passed, at the exact boundary | unit semantics.test.ts |
| Semantics | Paused while on hold; decided in time or late | unit semantics.test.ts |
| Semantics | Aging bucket edges (24 h, 48 h, 7 d, 14 d, 30 d), negative age | unit semantics.test.ts |
| Statistics | Median (odd/even/empty), percentile, change from zero = none, share of zero | unit semantics.test.ts |
| Periods | India date across UTC midnight; presets; financial year and quarter; custom range capped at two years; previous period | unit semantics.test.ts |
| Periods | Chart grain (day/week/month) and Monday week buckets | unit semantics.test.ts |
| Dictionary | Every metric complete, unique and present in the document | unit semantics.test.ts |
| Scope | Requester sees only their own requests; HOD sees their department; only IT gets the organisation | integration `tests/integration/analytics.int.test.ts` |
| Scope | Asking for a scope you don't have falls back to your own | integration `reports.int.test.ts`; e2e `v160-zanalytics.spec.ts` |
| Counting | Parallel step: 3 requests / 6 tasks counted separately | integration analytics.int.test.ts |
| Counting | Overdue only past a due time; my approvals count only my tasks | integration analytics.int.test.ts |
| Counting | SLA SQL matches the pure definition (passed vs within/approaching) | integration analytics.int.test.ts |
| Counting | Decisions by decision date; approval rate; in-time share; trend sums; aging sums | integration analytics.int.test.ts |
| Reports | Scoped rows; organisation-only reports refused; pending report SLA text | integration `reports.int.test.ts` |
| Exports | CSV formula guard; India time in CSV | unit `tests/analytics/export.test.ts` |
| Exports | XLSX: valid ZIP (CRC checked), inline strings only (no formulas), numbers as numbers, XML escaped | unit export.test.ts |
| Exports | PDF pages a long report; header on each page | unit export.test.ts |
| Exports | Real downloads: content type, file name, magic bytes; requester fallback; 404 for unknown or unauthorised | e2e `v160-zreports.spec.ts` |
| Schedules | Next run in India time (daily, weekly, monthly, midnight, year rollover) | unit `tests/analytics/schedule.test.ts` |
| Schedules | Two overlapping runs deliver a slot once; the next slot moves on; failures are recorded | integration reports.int.test.ts |
| Schedules | Inactive owner → paused, not run | integration reports.int.test.ts |
| Alerts | Fire on crossing, not again in the cool-down, again after it; reset below the line | unit schedule.test.ts |
| Alerts | End to end: fires once, no repeat while over, resets; a scope the owner doesn't have disables the rule | integration reports.int.test.ts |
| UI | KPI cards, comparison text, chart table view, filters, glossary | e2e `v160-zanalytics.spec.ts` |
| UI | Phone width: no sideways scroll | e2e v160-zanalytics.spec.ts |
| UI | Accessibility (axe, light and dark): Analytics, glossary, Reports, a report | e2e `v160-ui.spec.ts` |
| UI | Save view, schedule, alert from the screens | e2e v160-zreports.spec.ts |
