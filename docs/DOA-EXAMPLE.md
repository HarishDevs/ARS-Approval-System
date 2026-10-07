# DoA (Delegation of Authority): what it is, with an example

**DoA = who is allowed to approve how much.** As the amount grows, more senior people have to approve. In this app, the DoA is a set of amount bands on an approval type. Each band adds approval levels.

## The example built into the demo data: Purchase & SCM Approval

| Amount of the purchase | Who approves, in order |
|---|---|
| Up to ₹1,00,000 | Purchase & SCM head |
| ₹1,00,001 to ₹10,00,000 | Purchase & SCM head → Finance head |
| ₹10,00,001 to ₹25,00,000 | Purchase & SCM head → Finance head → ED |
| Above ₹25,00,000 | Purchase & SCM head → Finance head → ED → MD |

So:
- **₹40,000** of spares goes only to the SCM head.
- **₹6 lakh** goes to the SCM head, then Finance.
- **₹15 lakh** goes SCM head → Finance → ED.
- **₹40 lakh** needs all four.

The person raising it doesn't choose any of this: the app reads the amount and sends it to the right people.

You can see the live version at **Admin → Approval authority (DoA)**. It is read straight from the workflows, so it is always what the app really does.

## How it is set up (no code)
In **Admin → Workflows → Purchase & SCM Approval**, each level has a rule: "Skip this step when amount is at most …":

| Level | Skip when amount is at most |
|---|---|
| Purchase & SCM head | never skipped |
| Finance head | ₹1,00,000 |
| ED | ₹10,00,000 |
| MD | ₹25,00,000 |

To change a limit, edit the number and publish a new version. Requests already running keep the version they started with.

## What we need from you (Q-004)
Fill in one table like this for each approval type that depends on amount. The bands and people below are only an example:

| Approval type | Amount band | Levels, in order |
|---|---|---|
| Purchase & SCM | up to ₹ ____ | ____ |
| Purchase & SCM | ₹ ____ to ₹ ____ | ____ → ____ |
| Purchase & SCM | above ₹ ____ | ____ → ____ → ____ |
| Capex | … | … |
| Payments / vendor advances | … | … |

Other things a DoA can use, if you need them:
- **"Not in budget" adds a level** (for example, Finance must approve anything outside the budget, whatever the amount).
- **Several people at one level**: all of them, any one of them, or any 2 of 3.
- **Parallel review**: for example, Sales, Plant and Finance review at the same time, then ED.

These can be combined freely, which is the point of the platform: multi-level approvals in any custom manner.
