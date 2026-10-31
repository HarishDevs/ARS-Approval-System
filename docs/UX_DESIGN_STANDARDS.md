# UX Design Standards

ARS-CMS, from v1.36.0 (D-234). These are the rules every new screen follows. They describe what the code already does (tokens in `styles/globals.css`, components in `features/ui`), so a new page looks and behaves like the rest.

## 1. Colours and themes
- **Tokens only:** `primary`, `ink` (text), `line` (borders), `surface` / `page` / `raised` (backgrounds), `success`, `warning`, `danger`, `info`.
  - `-600` is for text and icons.
  - `-solid` is for fills that carry `text-on-solid`.
  - No raw hex values and no raw palette (`bg-white`, `text-red-500`). Light and dark both come from the same tokens.
- **One emphasis per screen:** one primary button per form or panel (Von Restorff). Danger red is only for irreversible actions and errors.
- **Never colour alone:** every state has words, and an icon where it helps.

## 2. Typography
- Text tokens: `text-title`, `text-card-title`, `text-body`, `text-label`, `text-caption`.
- All sizes follow `--text-scale` (Classic text size), so no fixed px.
- Page titles come from `PageHeader` (h1). Card titles are h2.

## 3. Spacing and grouping (Proximity, Chunking, Connectedness)
- A label sits right above its field (`field-label` + `field-input`). Help is a `Hint` beside the label, and the error (`FieldError`) is right below the field.
- Related things share a `card`. Sections are separated by spacing or a heading, not by extra borders.
- A form of more than about 7 fields is split into titled sections.
- A sequence (approval levels, wizard steps) is shown connected: done ✓, current highlighted, upcoming muted (`StepMap`).

## 4. Buttons (Fitts, Similarity, Von Restorff)

| Role | Class | Notes |
|---|---|---|
| Main action | `btn-primary` (+ `btn-compact` in toolbars and rows) | One per form |
| Other actions | `btn-secondary` | |
| Quiet / toolbar | `btn-ghost`, `tb-btn` | 28–36px; 44px on touch screens |
| Irreversible action button | `btn-danger-quiet` | Placed **apart** (end of row, `sm:ml-auto`), **confirms** first |
| Confirm in a dialog | `btn-danger` | |
| Small row delete | `ConfirmButton` | Always asks; 32px hit area |

- Minimum target is 32px (24px only for inline × inside a chip). Small visual controls get a larger hit area (TaskCheck).
- A button that runs something disables while it runs and says what it is doing ("Working…", "Saving…") through `SubmitButton`, `useActionForm` or `useWorkCall`'s `pending`.

## 5. Forms (Postel, Tesler, Default, Working memory, Active user)
- Use `useActionForm` (validation messages, single submit, time limit, session, offline) and `FieldError` / `ResultMessage`.
- **Accept the way people type** and normalise on the server:
  - spaces, dashes and the trunk 0 in phone numbers;
  - commas and ₹ in amounts;
  - case and dashes in record numbers.
  - Validate the value, not the format.
- **Prefill what the system knows** (profile department, reporting manager, the previous request) and say where it came from. Never prefill anything risky or paid.
- **Long forms keep the person's work:** requests autosave drafts; other long forms carry `UnsavedGuard`.
- Server-side validation always (zod); client checks are a convenience only.

## 6. Tables and lists (Hick, Choice overload)
- A searchable list uses `ListToolbar` (Filter, Sort, Group, Options, Search) or `TaskGrid`. Choices in use show as pills with ×.
- No data at all → `EmptyState` (what it means and what to do). A search or filter that matched nothing → `NoResults` (the words searched, Clear search, Reset filters).
- Pagination and density are remembered where it helps (saved and default views).

## 7. Navigation (Jakob, Serial position, Steering)
- **Header:** logo top-left (home), search in the middle (Ctrl+K), bell and profile top-right.
- **Sidebar:** collapsible rail, + Create first, groups that open on click; the current page is highlighted.
- Menus open on click, never on hover alone, and close on Esc or an outside click.
- "Back" goes to the list the breadcrumb names.

## 8. Dialogs and overlays (Figure-ground)
- `Dialog` / `ConfirmDialog`: a native modal with a dimmed backdrop, focus trapped and returned.
- Confirm only irreversible or costly actions (Parkinson: no confirm for routine saves).
- Floating helpers (Pico Bot, Draft task) never cover a page's main actions.

## 9. Notifications and banners (Banner blindness)
- **Page-top banners** are for the whole app: maintenance, offline, updated, view-only, try-as.
- **A warning about one action** sits next to that action (budget and submission checks above the decision buttons; readiness above Submit).
- **Toasts:** success, info, warning (partial success) or error. The success style appears only after the server confirms.

## 10. Loading and responsiveness (Doherty)
- Feedback within about 150 ms: button state, navigation bar, skeletons on read-only pages, a slow notice after 8 s.
- No fake percentages.

## 11. Responsive and accessibility
- Works at 360, 390, 768, 1366 and 1920 px with no sideways scroll (tested).
- Strips that scroll sideways use `.scroll-hint` (Closure).
- Every control has a label. States use `role="status"` or `role="alert"`. Keyboard paths cover search, menus, Classic and the task area. axe has no serious findings on the main pages (tested, light and dark).

## 12. The 24 laws: rules of thumb

| # | Law | Rule here |
|---|---|---|
| 01 | Fitts | Main and frequent targets are big and near; irreversible ones apart |
| 02 | Hick | Show the common choices; fold the rest (details, menus, Filter panel) |
| 03 | Chunking | Sections of about 4–7; numbers and identifiers grouped |
| 04 | Doherty | Acknowledge every click at once; real progress only |
| 05 | Proximity | Label, help and error beside their field; warnings beside their action |
| 06 | Von Restorff | One primary per area; danger only for danger |
| 07 | Goal gradient | Show done, current and left (stepper, "X of Y") |
| 08 | Postel | Accept loose input and normalise it on the server |
| 09 | Tesler | The system fills what it knows (profile, manager, previous request) |
| 10 | Similarity | Same look means same behaviour (one danger style, one row delete) |
| 11 | Serial position | Most used first or last in menus |
| 12 | Peak-end | Finish with the result, its number and the next step |
| 13 | Closure | Show that more exists (scroll shadows, partial columns) |
| 14 | Figure-ground | Dim behind dialogs; nothing floats over main actions |
| 15 | Banner blindness | Put warnings at the point of action |
| 16 | Parkinson | Fewer steps: defaults, next item, quick-add, bulk |
| 17 | Connectedness | Lines join steps in a sequence |
| 18 | Choice overload | Recommended or default first; advanced options folded |
| 19 | Jakob | Familiar places and patterns |
| 20 | Steering | Click menus, wide paths, no hover traps |
| 21 | Prägnanz | Tokens, few borders and shadows, simple icons (lucide) |
| 22 | Working memory | Keep context (filters in the address, recents, saved views, prefill) |
| 23 | Active user | Autosave or guard work; let people resume |
| 24 | Default effect | Sensible, explained, easy to change; never risky |
