# ARS Approval Platform

One configurable approval engine for ARS Steels & Alloy International Pvt Ltd. **Its main purpose is multi-level approvals in any custom manner.** It replaces the 104 Asana approval projects.

- **Address:** `approval.arssteels.net`
  - `/users`: everyone. Create requests, create custom approvals, act on your approval queue.
  - `/admin`: IT team. Predefined approvals, forms, workflows, DoA, users and roles.
  - `/superadmin`: itadmin@arssteels.co.in only. Providers, security, integrations, system health, audit.
- **Status:** planning complete; code scaffold is next (see `PLAN-CHECKLIST.md` → Now / Next).

## Project files
| File | What it holds |
|---|---|
| [DEVELOPMENT-MEMORY.md](DEVELOPMENT-MEMORY.md) | Decisions, open questions, work log, features, reference notes |
| [PLAN-CHECKLIST.md](PLAN-CHECKLIST.md) | Every task as a checklist, guardrails, notification events, coverage map |
| [FLOWS.md](FLOWS.md) | All flows: Asana reference flows and new platform flows |
| [CLAUDE.md](CLAUDE.md) | Working rules for every session |
| `reference/` | Asana approval audit, rule notes, plan pages (v1–v3), earlier write-up |

## Stack (planned)
Next.js 15 · React 19 · TypeScript · Tailwind (ARS tokens) · MySQL 8 · Firebase Auth (Google) · WhatsApp OTP via CEOITBox · Resend email · GoDaddy Node.js Hosting.

Secrets are never committed. See `.gitignore`.
