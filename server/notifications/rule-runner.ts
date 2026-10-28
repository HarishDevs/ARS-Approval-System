import "server-only";
import { listUserIdsWithRole } from "@/lib/db/repositories/users.repository";
import { activeDelegates, approvalCandidates, claimSend, listActiveRules, recordRecipients, sentSoFar, taskCandidates, type RuleCandidate, type StoredRule } from "@/lib/db/repositories/notification-rules.repository";
import { notify } from "@/server/notifications/notify";
import { conditionsMatch, DEFAULT_TEXT, renderTemplate, stageSendDue, type Stage } from "@/server/notifications/rule-model";
import { appBaseUrl } from "@/lib/http/app-url";
import { logError } from "@/lib/logging/logger";

// D-209: the job runner step "rules". For every active rule and every open
// record it applies to: the conditions are checked, each stage's due send is
// worked out, the send is claimed (once per rule, record, stage and repeat)
// and the message goes to the stage's recipients: inbox always, email when
// the rule says so. Escalations are mandatory messages (preferences.ts).
export interface RuleRunResult {
  rules: number;
  checked: number;
  sent: number;
  messages: number;
}

const formatDue = (due: Date | null) =>
  due ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(due) : "no due time";

async function recipientsFor(stage: Stage, record: RuleCandidate, itAdmins: () => Promise<number[]>): Promise<number[]> {
  const ids = new Set<number>(stage.userIds);
  for (const kind of stage.recipients) {
    if (kind === "ASSIGNEE") ids.add(record.assigneeId);
    if (kind === "DELEGATE") (await activeDelegates(record.assigneeId)).forEach((id) => ids.add(id));
    if (kind === "ASSIGNEE_MANAGER" && record.assigneeManagerId) ids.add(record.assigneeManagerId);
    if (kind === "ASSIGNEE_MANAGER_2" && record.assigneeManager2Id) ids.add(record.assigneeManager2Id);
    if (kind === "REQUESTER" && record.requesterId) ids.add(record.requesterId);
    if (kind === "REQUESTER_MANAGER" && record.requesterManagerId) ids.add(record.requesterManagerId);
    if (kind === "HOD" && record.hodId) ids.add(record.hodId);
    if (kind === "IT_ADMINS") (await itAdmins()).forEach((id) => ids.add(id));
  }
  return [...ids];
}

export function messageFor(rule: Pick<StoredRule, "kind" | "name" | "subject" | "body">, record: RuleCandidate, stageNo: number, base: string): { subject: string; text: string } {
  const values = {
    ref: record.ref,
    title: record.title,
    type: String(record.fields.type ?? ""),
    step: record.stepLabel,
    assignee: record.assigneeName,
    requester: record.requesterName,
    due: formatDue(record.due),
    hours_pending: String(record.fields.hours_pending ?? ""),
    hours_overdue: String(record.fields.hours_overdue ?? 0),
    link: `${base.replace(/\/$/, "")}${record.linkPath}`,
    rule: rule.name,
    level: String(stageNo),
  };
  const fallback = DEFAULT_TEXT[rule.kind];
  return { subject: renderTemplate(rule.subject || fallback.subject, values).slice(0, 200), text: renderTemplate(rule.body || fallback.body, values) };
}

export async function runNotificationRules(now = new Date()): Promise<RuleRunResult> {
  const rules = await listActiveRules();
  const result: RuleRunResult = { rules: rules.length, checked: 0, sent: 0, messages: 0 };
  if (!rules.length) return result;
  const base = appBaseUrl();
  let admins: number[] | null = null;
  const itAdmins = async () => (admins ??= await listUserIdsWithRole("IT_ADMIN"));
  const byModule = {
    APPROVAL: rules.some((rule) => rule.module === "APPROVAL") ? await approvalCandidates(now) : [],
    TASK: rules.some((rule) => rule.module === "TASK") ? await taskCandidates(now) : [],
  };
  for (const rule of rules) {
    for (const record of byModule[rule.module]) {
      if (!conditionsMatch(rule, record.fields)) continue;
      result.checked += 1;
      const anchors = { STARTED: record.started, RAISED: record.raised, DUE: record.due };
      const sent = await sentSoFar(rule.id, record.recordKind, record.recordId);
      for (const [index, stage] of rule.stages.entries()) {
        const stageNo = index + 1;
        const due = stageSendDue(stage, anchors, now);
        if (due === null || due <= (sent.get(stageNo) ?? 0)) continue;
        const sendId = await claimSend(rule.id, record.recordKind, record.recordId, stageNo, due);
        if (sendId === null) continue;
        try {
          const to = await recipientsFor(stage, record, itAdmins);
          const message = messageFor(rule, record, stageNo, base);
          for (const userId of to) {
            await notify({
              eventType: rule.kind === "ESCALATION" ? "RULE_ESCALATION" : "RULE_REMINDER",
              userId,
              title: message.subject,
              message: message.text.split("\n")[0] ?? message.subject,
              deepLink: record.linkPath,
              email: rule.email ? { subject: message.subject, text: message.text } : null,
              whatsappVariables: null,
            });
          }
          await recordRecipients(sendId, to.length);
          result.sent += 1;
          result.messages += to.length;
        } catch (error) {
          logError("notification rule: send failed", error, { ruleId: rule.id, record: `${record.recordKind}:${record.recordId}`, stageNo });
        }
      }
    }
  }
  return result;
}

// What a rule would do now, without sending (Admin → Test).
export async function previewRule(rule: Pick<StoredRule, "module" | "match" | "conditions" | "stages">, now = new Date()): Promise<{ matching: number; dueNow: number; examples: { ref: string; title: string; stage: number | null }[] }> {
  const records = rule.module === "APPROVAL" ? await approvalCandidates(now) : await taskCandidates(now);
  const matching = records.filter((record) => conditionsMatch(rule, record.fields));
  const examples = matching.map((record) => {
    const anchors = { STARTED: record.started, RAISED: record.raised, DUE: record.due };
    const stage = rule.stages.findIndex((item) => stageSendDue(item, anchors, now) !== null);
    return { ref: record.ref, title: record.title, stage: stage === -1 ? null : stage + 1 };
  });
  return { matching: matching.length, dueNow: examples.filter((item) => item.stage !== null).length, examples: examples.slice(0, 10) };
}
