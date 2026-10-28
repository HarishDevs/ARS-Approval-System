"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { previewRuleAction, saveRuleAction } from "@/app/admin/reminders/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";
import { PeoplePicker, type PersonOption } from "@/features/ui/PeoplePicker";
import {
  ANCHOR_LABEL,
  ANCHORS,
  DEFAULT_TEXT,
  KIND_LABEL,
  MODULE_LABEL,
  OPERATOR_LABEL,
  OPERATORS,
  PLACEHOLDERS,
  RECIPIENT_LABEL,
  RECIPIENTS,
  RULE_MODULES,
  STANDARD_FIELDS,
  type Condition,
  type RuleInput,
  type RuleModule,
  type Stage,
} from "@/server/notifications/rule-model";

// D-209 (owner): one reminder or escalation rule: what it applies to, the
// conditions (any field, any value), the stages (when, how often, to whom)
// and the message. "Test" shows what it would do now, without sending.
const newStage = (kind: RuleInput["kind"]): Stage =>
  kind === "ESCALATION"
    ? { anchor: "DUE", offsetHours: 24, repeatHours: null, maxTimes: 1, recipients: ["ASSIGNEE_MANAGER"], userIds: [] }
    : { anchor: "STARTED", offsetHours: 24, repeatHours: null, maxTimes: 1, recipients: ["ASSIGNEE"], userIds: [] };

export function NotificationRuleEditor({
  id,
  initial,
  formFields,
  people,
}: {
  id: number | null;
  initial: RuleInput;
  formFields: Record<RuleModule, { key: string; label: string }[]>;
  people: PersonOption[];
}) {
  const router = useRouter();
  const [rule, setRule] = useState<RuleInput>(initial);
  const save = useActionForm(saveRuleAction);
  const test = useActionForm(previewRuleAction);
  const savedId = save.result?.ok ? Number(save.result.data?.id ?? 0) : 0;
  useEffect(() => {
    if (savedId && savedId !== id) router.replace(`/admin/reminders/${savedId}?saved=1`);
  }, [savedId, id, router]);

  const set = <K extends keyof RuleInput>(key: K, value: RuleInput[K]) => setRule((current) => ({ ...current, [key]: value }));
  const fields = [...STANDARD_FIELDS[rule.module], ...formFields[rule.module].map((field) => ({ ...field, kind: "text" as const }))];
  const setCondition = (index: number, change: Partial<Condition>) => set("conditions", rule.conditions.map((item, i) => (i === index ? { ...item, ...change } : item)));
  const setStage = (index: number, change: Partial<Stage>) => set("stages", rule.stages.map((item, i) => (i === index ? { ...item, ...change } : item)));
  const defaults = DEFAULT_TEXT[rule.kind];
  const payload = JSON.stringify(rule);

  return (
    <div className="space-y-6">
      <section className="card space-y-4 px-5 py-4" aria-labelledby="rule-basics">
        <h2 id="rule-basics" className="font-semibold">
          The rule
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="field-label">Name</span>
            <input className="field-input" value={rule.name} maxLength={150} onChange={(event) => set("name", event.target.value)} placeholder="e.g. Purchase approvals over ₹5 lakh: escalate after a day" />
          </label>
          <label className="block">
            <span className="field-label">Applies to</span>
            <select className="field-input" value={rule.module} onChange={(event) => setRule((current) => ({ ...current, module: event.target.value as RuleModule, conditions: [] }))}>
              {RULE_MODULES.map((module) => (
                <option key={module} value={module}>
                  {MODULE_LABEL[module]}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="field-label">Kind</legend>
            <div className="flex flex-wrap gap-4 pt-1">
              {(["REMINDER", "ESCALATION"] as const).map((kind) => (
                <label key={kind} className="flex items-center gap-2 text-label">
                  <input type="radio" name="kind" checked={rule.kind === kind} onChange={() => set("kind", kind)} />
                  {KIND_LABEL[kind]}
                  <Hint text={kind === "REMINDER" ? "A nudge to the person who has to act. People can switch reminder emails off." : "Tells managers or IT that something is late. Escalation emails always go out."} align="start" />
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-6 pt-6">
            <label className="flex items-center gap-2 text-label">
              <input type="checkbox" checked={rule.active} onChange={(event) => set("active", event.target.checked)} />
              On
            </label>
            <label className="flex items-center gap-2 text-label">
              <input type="checkbox" checked={rule.email} onChange={(event) => set("email", event.target.checked)} />
              Also send by email
              <Hint text="Every message lands in the Notifications inbox. Tick to email it as well." align="start" />
            </label>
          </div>
        </div>
      </section>

      <section className="card space-y-3 px-5 py-4" aria-labelledby="rule-conditions">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="rule-conditions" className="font-semibold">
            When it applies
          </h2>
          <Hint text="Any field, including the form fields of approval and task types. Text ignores capitals; numbers compare as numbers. For 'is one of', separate values with commas. No conditions = every pending step or open task." align="start" />
          {rule.conditions.length > 1 && (
            <select aria-label="Match" className="field-input h-8 w-auto" value={rule.match} onChange={(event) => set("match", event.target.value as RuleInput["match"])}>
              <option value="ALL">All conditions must match</option>
              <option value="ANY">Any one condition is enough</option>
            </select>
          )}
        </div>
        {rule.conditions.length === 0 && <p className="text-label text-ink-muted">Applies to every {rule.module === "APPROVAL" ? "pending approval step" : "open task"}.</p>}
        <ol className="space-y-2">
          {rule.conditions.map((condition, index) => (
            <li key={index} className="grid gap-2 md:grid-cols-[1.4fr_1fr_1.4fr_auto]" data-testid="rule-condition">
              <select aria-label={`Condition ${index + 1}: field`} className="field-input" value={condition.field} onChange={(event) => setCondition(index, { field: event.target.value })}>
                <option value="">Choose a field…</option>
                {fields.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
              <select aria-label={`Condition ${index + 1}: test`} className="field-input" value={condition.op} onChange={(event) => setCondition(index, { op: event.target.value as Condition["op"] })}>
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {OPERATOR_LABEL[op]}
                  </option>
                ))}
              </select>
              {condition.op === "EMPTY" || condition.op === "NOT_EMPTY" ? (
                <span />
              ) : (
                <input aria-label={`Condition ${index + 1}: value`} className="field-input" value={condition.value} maxLength={500} onChange={(event) => setCondition(index, { value: event.target.value })} placeholder={condition.op === "IN" ? "e.g. HIGH, URGENT" : "Value"} />
              )}
              <button type="button" className="btn-secondary btn-compact" aria-label={`Remove condition ${index + 1}`} onClick={() => set("conditions", rule.conditions.filter((_, i) => i !== index))}>
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="btn-secondary btn-compact" disabled={rule.conditions.length >= 20} onClick={() => set("conditions", [...rule.conditions, { field: "", op: "EQ", value: "" }])}>
          <Plus aria-hidden="true" className="h-4 w-4" /> Add a condition
        </button>
      </section>

      <section className="card space-y-3 px-5 py-4" aria-labelledby="rule-stages">
        <div className="flex items-center gap-1.5">
          <h2 id="rule-stages" className="font-semibold">
            {rule.kind === "ESCALATION" ? "Escalation levels" : "When to remind"}
          </h2>
          <Hint text="Each stage is sent once (or repeated as set) to its own people. Add stages for escalation levels, e.g. the manager after 1 day, the manager's manager and IT after 3 days. Records already past a stage's time get it on the next run." align="start" />
        </div>
        <ol className="space-y-3">
          {rule.stages.map((stage, index) => (
            <li key={index} className="space-y-3 rounded-md border border-line p-3" data-testid="rule-stage">
              <div className="flex items-center justify-between gap-2">
                <p className="text-label font-semibold uppercase tracking-wide text-ink-muted">{rule.kind === "ESCALATION" ? `Level ${index + 1}` : `Stage ${index + 1}`}</p>
                {rule.stages.length > 1 && (
                  <button type="button" className="btn-secondary btn-compact" onClick={() => set("stages", rule.stages.filter((_, i) => i !== index))}>
                    Remove
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2 text-label">
                <label className="block">
                  <span className="field-label">Hours</span>
                  <input aria-label={`Stage ${index + 1}: hours`} type="number" min={0} max={4320} className="field-input w-24" value={Math.abs(stage.offsetHours)} onChange={(event) => setStage(index, { offsetHours: Math.sign(stage.offsetHours || 1) * Math.max(0, Number(event.target.value) || 0) })} />
                </label>
                <label className="block">
                  <span className="field-label">&nbsp;</span>
                  <select aria-label={`Stage ${index + 1}: before or after`} className="field-input w-28" value={stage.offsetHours < 0 ? "BEFORE" : "AFTER"} onChange={(event) => setStage(index, { offsetHours: (event.target.value === "BEFORE" ? -1 : 1) * Math.abs(stage.offsetHours), ...(event.target.value === "BEFORE" ? { anchor: "DUE" as const } : {}) })}>
                    <option value="AFTER">after</option>
                    <option value="BEFORE">before</option>
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">&nbsp;</span>
                  <select aria-label={`Stage ${index + 1}: from`} className="field-input" value={stage.anchor} onChange={(event) => setStage(index, { anchor: event.target.value as Stage["anchor"], ...(event.target.value !== "DUE" && stage.offsetHours < 0 ? { offsetHours: Math.abs(stage.offsetHours) } : {}) })}>
                    {ANCHORS.filter((anchor) => !(rule.module === "TASK" && anchor === "RAISED")).map((anchor) => (
                      <option key={anchor} value={anchor}>
                        {ANCHOR_LABEL[anchor]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 pb-2">
                  <input type="checkbox" checked={stage.maxTimes > 1} onChange={(event) => setStage(index, event.target.checked ? { maxTimes: 3, repeatHours: stage.repeatHours ?? 24 } : { maxTimes: 1, repeatHours: null })} />
                  Repeat
                </label>
                {stage.maxTimes > 1 && (
                  <>
                    <label className="block">
                      <span className="field-label">every (hours)</span>
                      <input aria-label={`Stage ${index + 1}: repeat every hours`} type="number" min={1} max={720} className="field-input w-24" value={stage.repeatHours ?? 24} onChange={(event) => setStage(index, { repeatHours: Math.max(1, Number(event.target.value) || 1) })} />
                    </label>
                    <label className="block">
                      <span className="field-label">times in all</span>
                      <input aria-label={`Stage ${index + 1}: times in all`} type="number" min={2} max={20} className="field-input w-20" value={stage.maxTimes} onChange={(event) => setStage(index, { maxTimes: Math.min(20, Math.max(2, Number(event.target.value) || 2)) })} />
                    </label>
                  </>
                )}
              </div>
              <fieldset>
                <legend className="field-label">Send to</legend>
                <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
                  {RECIPIENTS.map((kind) => (
                    <label key={kind} className="flex items-center gap-2 text-label">
                      <input type="checkbox" checked={stage.recipients.includes(kind)} onChange={(event) => setStage(index, { recipients: event.target.checked ? [...stage.recipients, kind] : stage.recipients.filter((item) => item !== kind) })} />
                      {RECIPIENT_LABEL[kind]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <PeoplePicker label="Also these people" options={people} value={stage.userIds} onChange={(ids) => setStage(index, { userIds: ids })} max={50} help="Type a name or user id." />
            </li>
          ))}
        </ol>
        <button type="button" className="btn-secondary btn-compact" disabled={rule.stages.length >= 10} onClick={() => set("stages", [...rule.stages, newStage(rule.kind)])}>
          <Plus aria-hidden="true" className="h-4 w-4" /> {rule.kind === "ESCALATION" ? "Add a level" : "Add a stage"}
        </button>
      </section>

      <section className="card space-y-3 px-5 py-4" aria-labelledby="rule-message">
        <div className="flex items-center gap-1.5">
          <h2 id="rule-message" className="font-semibold">
            Message
          </h2>
          <Hint text={`Leave empty for the standard wording. Placeholders: ${PLACEHOLDERS.map((key) => `{{${key}}}`).join(" ")}`} align="start" />
        </div>
        <label className="block">
          <span className="field-label">Subject</span>
          <input className="field-input" value={rule.subject} maxLength={200} onChange={(event) => set("subject", event.target.value)} placeholder={defaults.subject} />
        </label>
        <label className="block">
          <span className="field-label">Text</span>
          <textarea className="field-input min-h-28" value={rule.body} maxLength={4000} onChange={(event) => set("body", event.target.value)} placeholder={defaults.body} />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={save.onSubmit}>
          {id !== null && <input type="hidden" name="id" value={id} />}
          <input type="hidden" name="rule" value={payload} />
          <SubmitButton pending={save.pending} className="btn-compact">
            Save rule
          </SubmitButton>
        </form>
        <form onSubmit={test.onSubmit}>
          <input type="hidden" name="rule" value={payload} />
          <SubmitButton pending={test.pending} variant="secondary" className="btn-compact">
            Test (nothing is sent)
          </SubmitButton>
        </form>
      </div>
      <ResultMessage result={save.result} />
      {test.result && (
        <div data-testid="rule-test">
          <ResultMessage result={test.result} />
        </div>
      )}
    </div>
  );
}
