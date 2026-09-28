import { PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";

const MODULES = [
  { title: "Approval types", body: "Predefined approvals such as MD, ED, Finance and Purchase, each with its own form." },
  { title: "Workflows", body: "Any number of levels: sequential, parallel, any-one, any-N-of-M and conditional, checked before publishing." },
  { title: "Approval authority (DoA)", body: "Amount bands per request type that decide which levels a request needs." },
  { title: "Users & roles", body: "Add or deactivate users, set how they sign in, and assign roles." },
];

export default async function AdminHome() {
  // Pages re-check the area themselves: a layout check alone does not stop
  // a page from rendering in the App Router.
  await requireArea("admin");
  return (
    <>
      <PageHeader title="Admin" description="Where the IT team builds and maintains the predefined approvals." />
      <div className="grid gap-4 sm:grid-cols-2">
        {MODULES.map((module) => (
          <div key={module.title} className="rounded-lg border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{module.title}</h2>
              <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-caption text-ink-muted">Being built</span>
            </div>
            <p className="mt-2 text-ink-muted">{module.body}</p>
          </div>
        ))}
      </div>
    </>
  );
}
