import { TaskPriorityPill } from "@/features/ui/ChoicePill";
import type { Metadata } from "next";
import { featureOn } from "@/server/settings/features";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge, Breadcrumbs } from "@/features/ui/Display";
import { EditPublishedForm, InfoActionButton } from "@/features/modules/InfoForms";
import { FieldValues, FileLinks, HistoryList } from "@/features/modules/RecordParts";
import { INFO_STATE_TONE } from "@/features/modules/InfoListScreen";
import { listInfoEvents, listRecipients, markInfoRead } from "@/lib/db/repositories/info.repository";
import { listPeopleFacts } from "@/lib/db/repositories/tasks.repository";
import { loadFieldLookups, loadLookupNames } from "@/lib/db/repositories/lookups.repository";
import { listRecordFiles } from "@/server/modules/files";
import { indiaToday, loadInfoFor } from "@/server/modules/information";
import { infoState, INFO_STATE_LABEL } from "@/server/modules/info-rules";
import { indiaDateTimeText } from "@/server/modules/settings";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Information" };

export const dynamic = "force-dynamic";

const EVENT_TEXT: Record<string, string> = { CREATED: "Draft started", DRAFT_SAVED: "Draft saved", PUBLISHED: "Published", ACKNOWLEDGED: "Acknowledged", WITHDRAWN: "Withdrawn", ARCHIVED: "Archived", UPDATED: "Updated" };

// v1.9.0 (D-143, D-145): one piece of information. The sender and IT see who
// read and acknowledged it; a recipient opening it marks it read (never
// acknowledged). Anyone else gets "not found".
export default async function InformationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ published?: string; saved?: string }> }) {
  const { user } = await requireArea("users");
  if (!(await featureOn("information", user))) notFound();
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const loaded = await loadInfoFor(Number(id), user);
  if (!loaded) notFound();
  const { item, settings, form, versionNo, viewer, actions } = loaded;
  // QA-SEC-02: IT looking as someone (Try as, view-only) doesn't mark it read for them.
  if (viewer.recipient && !viewer.recipient.readAt && item.status !== "DRAFT" && !user.triedBy) await markInfoRead(item.id, user.id);
  const owner = viewer.id === item.createdBy || viewer.isAdmin;
  const [events, files, people, lookups, lookupNames, recipients] = await Promise.all([
    listInfoEvents(item.id),
    listRecordFiles("INFO", item.id),
    listPeopleFacts(),
    loadFieldLookups(),
    loadLookupNames(),
    owner ? listRecipients(item.id) : Promise.resolve([]),
  ]);
  const query = await searchParams;
  const state = infoState(item, indiaToday());
  const names = new Map(people.map((person) => [person.id, person.name]));
  const editable = form.filter((field) => field.editable && field.type !== "ATTACHMENT" && field.type !== "CALC");
  const values = Object.fromEntries(editable.map((field) => [field.key, Array.isArray(item.formData[field.key]) ? JSON.stringify(item.formData[field.key]) : item.formData[field.key] === undefined ? "" : String(item.formData[field.key])]));
  const readCount = recipients.filter((row) => row.readAt).length;
  const ackCount = recipients.filter((row) => row.acknowledgedAt).length;

  return (
    <>
      <Breadcrumbs items={[{ href: viewer.recipient ? "/users/information" : "/users/information/sent", label: "Information" }, { label: item.infoNo }]} />
      <PageHeader title={item.title} meta={`${item.infoNo} · ${item.typeName} (version ${versionNo}) · from ${item.createdByName}`}>
        <Badge tone={INFO_STATE_TONE[state]}>{INFO_STATE_LABEL[state]}</Badge>
        <TaskPriorityPill priority={item.priority} showNormal />
      </PageHeader>
      {query.published && (
        <p role="status" className="mb-4 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          Published to {query.published} {query.published === "1" ? "person" : "people"}. They were told.
        </p>
      )}
      {query.saved && item.status === "DRAFT" && (
        <p role="status" className="mb-4 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          Draft saved. Nobody can see it until you publish it.
        </p>
      )}
      {viewer.recipient && item.ackRequired && (
        <p className={`mb-4 rounded-md px-3 py-2 text-label ${viewer.recipient.acknowledgedAt ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`} data-testid="ack-status">
          {viewer.recipient.acknowledgedAt ? `You acknowledged this on ${indiaDateTimeText(viewer.recipient.acknowledgedAt)}.` : "Please read this and press Acknowledge. Opening it only marks it read."}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="card space-y-4 px-5 py-4" aria-labelledby="message">
            <h2 id="message" className="sr-only">
              Message
            </h2>
            <p className="whitespace-pre-wrap">{item.body}</p>
            <dl className="grid gap-x-6 gap-y-3 text-label sm:grid-cols-3">
              {item.publishedAt && <Fact label="Published" value={indiaDateTimeText(item.publishedAt)} />}
              {item.effectiveOn && <Fact label="Takes effect" value={item.effectiveOn} />}
              <Fact label="Expires" value={item.expiresOn ?? "No expiry"} />
              {item.withdrawnAt && <Fact label="Withdrawn" value={`${indiaDateTimeText(item.withdrawnAt)}${item.withdrawReason ? `: ${item.withdrawReason}` : ""}`} />}
            </dl>
            <FieldValues form={form} data={item.formData} names={names} lookupNames={lookupNames} />
            <FileLinks files={files} />
          </section>
          {owner && item.status !== "DRAFT" && (
            <section className="card px-5 py-4" aria-labelledby="recipients">
              <h2 id="recipients" className="mb-1 font-semibold">
                Recipients
              </h2>
              <p className="mb-3 text-label text-ink-muted">
                {recipients.length} received it · {readCount} read{item.ackRequired ? ` · ${ackCount} acknowledged` : ""}
              </p>
              <div className="max-h-96 overflow-auto">
                <table className="data-table" data-testid="recipient-table">
                  <thead>
                    <tr>
                      <th scope="col">Person</th>
                      <th scope="col">Department</th>
                      <th scope="col">Read</th>
                      {item.ackRequired && <th scope="col">Acknowledged</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((row) => (
                      <tr key={row.userId}>
                        <td>{row.name}</td>
                        <td className="text-label">{row.departmentName ?? "—"}</td>
                        <td className="text-label">{row.readAt ? indiaDateTimeText(row.readAt) : "Not yet"}</td>
                        {item.ackRequired && <td className="text-label">{row.acknowledgedAt ? indiaDateTimeText(row.acknowledgedAt) : "Not yet"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {owner && (
            <section className="card px-5 py-4" aria-labelledby="history">
              <h2 id="history" className="mb-3 font-semibold">
                History
              </h2>
              <HistoryList entries={events.map((event) => ({ id: event.id, when: event.createdAt, who: event.actorName, what: event.eventType === "PUBLISHED" && event.payload ? `Published to ${String(event.payload.recipients)} people` : (EVENT_TEXT[event.eventType] ?? event.eventType), detail: event.body }))} />
            </section>
          )}
        </div>
        <aside className="space-y-4" aria-label="Information actions">
          <section className="card space-y-3 px-5 py-4">
            <h2 className="font-semibold">Actions</h2>
            {actions.size === 0 && <p className="text-label text-ink-muted">Nothing for you to do here.</p>}
            <div className="flex flex-wrap gap-2">
              {actions.has("ACKNOWLEDGE") && <InfoActionButton infoId={item.id} rowVersion={item.rowVersion} action="ACKNOWLEDGE" />}
              {actions.has("EDIT_DRAFT") && (
                <Link href={`/users/information/new?draft=${item.id}`} className="btn-secondary btn-compact">
                  Edit draft
                </Link>
              )}
              {actions.has("PUBLISH") && <InfoActionButton infoId={item.id} rowVersion={item.rowVersion} action="PUBLISH" confirm="The recipient list is fixed now and each person is told." />}
              {actions.has("DELETE_DRAFT") && <InfoActionButton infoId={item.id} rowVersion={item.rowVersion} action="DELETE_DRAFT" danger confirm="The draft is deleted. Nobody has seen it." />}
              {actions.has("ARCHIVE") && <InfoActionButton infoId={item.id} rowVersion={item.rowVersion} action="ARCHIVE" confirm="It moves out of the current lists. It stays readable in the history." />}
              {actions.has("WITHDRAW") && <InfoActionButton infoId={item.id} rowVersion={item.rowVersion} action="WITHDRAW" needsReason danger />}
            </div>
            {actions.has("EDIT_PUBLISHED") && <EditPublishedForm infoId={item.id} rowVersion={item.rowVersion} editable={editable} values={values} expiresOn={item.expiresOn ?? ""} people={people.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }))} lookups={lookups} />}
            {settings.ack === "NEVER" && viewer.recipient && <p className="text-caption text-ink-muted">No acknowledgement is asked for this one.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
