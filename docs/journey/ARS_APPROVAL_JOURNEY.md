# ARS approval journey (v1.44.0, D-273)

The owner's "Approval Progress Tracker" storyboard and brief, built as an
event-driven animation on the existing approval engine. The animation never
approves, completes or sends anything: it draws what the server has recorded.

## Layers

| Layer | What | Files |
|---|---|---|
| Workflow engine (source of truth) | Approvals, work steps, FYI, the request's records | `server/engine/*`, `server/approvals/*` (unchanged rules, plus background work below) |
| Journey model (server) | One request's journey: road, linked tasks, FYI delivery, event cursor, version | `server/journey/load.ts`, `server/journey/types.ts`, `server/approvals/road.ts` (the road, D-253) |
| Event controller (browser, pure) | Old state + newer state → scenes (seal, drive, unload, stamp, reload, finish) | `features/journey/controller.ts` |
| Visuals | Van, road, checkpoints, document, envelope, stamp, flag, activities | `features/journey/ARSApprovalJourney.tsx`, `JourneyArt.tsx`, `JourneyActivities.tsx`, `format.ts`, CSS `jr-*` in `styles/globals.css` |

One component per request (`ARSApprovalJourney`), so two requests never share a
van. The brief's component names map as: JourneyHeader → the header block;
JourneyRoad → `.jr-road`; ApprovalMilestones → the checkpoint buttons; ApprovalVan
/ VanFront / VanRear / VanCargoDoor / VanWheels → `JourneyVan` (`.jr-door`,
`.jr-wheel`, `.jr-body`); RequestDocument → `JourneyDocument`; SealedEnvelope →
`JourneyEnvelope`; ApprovalStamp → `JourneyStamp`; JourneyFinishFlag →
`JourneyFlag`; MilestoneDetails → `CheckpointDetails`; JourneyStatus → the
headline and percentage; WorkTaskActivity and FYIActivity → `JourneyActivities.tsx`;
JourneyEventController → `controller.ts` plus the player in the component.

## Events: where each comes from

The brief's event names are a contract; the app's own records are used (no new
event table). `approval_events` is the ordered, append-only log; its newest id
is the journey's **cursor**.

| Brief event | Recorded as | Journey reaction |
|---|---|---|
| REQUEST_SUBMITTED, APPROVAL_WORKFLOW_STARTED | `SUBMITTED` (+ `NODE_ACTIVATED`) | Seal scene (only on the page that just submitted), drive to the first level, unload |
| APPROVAL_STEP_ACTIVATED | `NODE_ACTIVATED`, `TASK_CREATED` | Checkpoint blue (pulsing); van stops beside it; document out |
| APPROVAL_STEP_APPROVED | `TASK_DECIDED` (APPROVE) → step APPROVED | Stamp (green), checkpoint green, reload, drive on |
| APPROVAL_STEP_REJECTED | `INSTANCE_REJECTED` | Red stamp, checkpoint red, van stops; reason in the details |
| APPROVAL_STEP_RETURNED | `CHANGES_REQUESTED` | Orange stamp, reload, van reverses to the start; forward again on `RESUBMITTED` |
| APPROVAL_STEP_DELEGATED | `TASK_REASSIGNED` | Checkpoint's people updated ("handed on"); van stays |
| APPROVAL_STEP_SKIPPED | `NODE_SKIPPED` / step SKIPPED | Checkpoint grey "Not needed"; van drives past |
| WORK_TASK_CREATED / ASSIGNED | Work step: `TASK_CREATED` + linked task (D-269); background work: `WORK_ASSIGNED` + linked task (D-273) | Work task card |
| WORK_TASK_STARTED / COMPLETED / CANCELLED | `tasks.status` (+ `task_events`) | Card status; completed: green with a tick |
| FYI_DISPATCH_STARTED / FYI_DISPATCHED | `NOTIFIED` + `notifications` (REQUEST_FYI) | FYI card, envelopes fly in |
| FYI_DELIVERY_FAILED | `notification_deliveries.status = FAILED` (no retry left) | Recipient "Failed" |
| APPROVAL_WORKFLOW_COMPLETED | `INSTANCE_APPROVED` | Drive to the flag, road green, 100%, tick |
| APPROVAL_WORKFLOW_CANCELLED | `WITHDRAWN` / `DELETED` | Remaining checkpoints "Withdrawn"; no animation |

Ordering and idempotency: a journey is accepted only if its cursor is not older
than the one drawn and its version differs. Scenes are computed between two
confirmed states, so a repeated or late answer plays nothing, and a refresh draws
the current state at once (the sealing plays once per request, just after
submitting). The browser asks `GET /api/requests/{id}/progress` every 10 s while
the page is visible, at once when the tab returns or the network comes back, and
backs off to 60 s while it fails ("Reconnecting…"). The app has no WebSocket or
SSE (GoDaddy Node hosting); polling is the mechanism.

## Rules

- **Percentage:** finished required levels ÷ required levels (`road.ts`): a skipped
  level counts as finished; a parallel or any-N level is one checkpoint (its people
  in the details); FYI levels and background work are not levels; "100%" only when
  the request is approved. Work tasks and FYI have their own status.
- **Work tasks:** a work step holds the request up (default; done on the request or
  by ticking the task). Untick "The request waits until it's done" and the step
  becomes **background work** (`background: true`): the people get linked tasks and
  the request moves on at once. Creating or finishing such a task never decides
  anything on the request. Its holder may read the parent request (read-only,
  `holdsLinkedTask` in `canViewRequest`); confidential values stay hidden.
- **FYI:** sent when the request reaches the FYI step's place in the workflow (put it
  after the last approval to release only on full approval). Never a checkpoint.
- **Reduced motion:** no scenes, no moving road or wheels; every state readable.
- **Hidden tab:** decorative animation paused; scenes skipped (the state is drawn).

## Placement

| Where | What |
|---|---|
| Request page (also right after submitting, `?submitted=1`) | Full journey, collapsible (remembered on the device) |
| Task page with a parent request the viewer may open | Compact journey |
| My requests / Waiting lists (computer) | Compact preview per row (`RoadMini`, D-256) |
| Mobile Approvals hub and Home cards | Compact preview per card |

## Records

- **Files created:** `features/journey/{ARSApprovalJourney,JourneyArt,JourneyActivities}.tsx`, `features/journey/{controller,format}.ts`, `server/journey/{load,types}.ts`, `tests/journey/journey.test.ts`, `tests/integration/journey.int.test.ts`, `tests/e2e/v144-journey.spec.ts`, this file.
- **Existing files changed:** `server/engine/{types,engine,validate}.ts` (background work), `server/workflows/builder.ts` (`holdsUp`), `server/approvals/{step-map,road,messages,timeline,work-mirror,service}.ts`, `lib/db/repositories/{approvals,work}.repository.ts`, `features/admin/WorkflowBuilder.tsx` (the box), `features/work/{ApprovalLink,TaskPane}.tsx`, `features/requests/{ApprovalRoad,RoadMini,StepMap}.tsx`, `app/api/requests/[id]/progress/route.ts`, `app/users/requests/[id]/page.tsx`, `app/users/tasks/[id]/page.tsx`, mobile cards, `styles/globals.css`. Removed: `features/requests/ArsVan.tsx` (replaced by `JourneyVan`).
- **API used:** `GET /api/requests/{id}/progress` (now also returns `journey`; same record check, 60 a minute).
- **Tables reused:** `approval_requests`, `approval_events`, `approval_tasks`, `tasks`, `notifications`, `notification_deliveries`, `users`, `workflow_versions`.
- **Schema changes:** none. New JSON values only: the engine event `WORK_ASSIGNED`, node flag `background`, builder `holdsUp`, task link `form_data_json.__approvalLink`.

## Not done (stated)

- Live push (WebSocket/SSE): polling every 10 s instead (hosting).
- Parallel levels are one grouped checkpoint with each person's status in its details, not drawn as separate branches.
- Information notices (`/users/information`) have no parent workflow, so they show no journey; FYI steps of requests do.
- Delegation is shown in the checkpoint's people ("handed on"), not as a separate animation.
- A task's own reassignment is shown on its card (the new person), not animated.
