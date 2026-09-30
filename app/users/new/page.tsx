import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { listWorkflows } from "@/lib/db/repositories/approvals.repository";

// Pick an approval type: active, published predefined types (custom
// approvals made by users come in a later session, P5).
export default async function NewRequestPage() {
  await requireArea("users");
  const types = (await listWorkflows({ kind: "PREDEFINED" })).filter((item) => item.active && item.publishedVersionNo !== null);
  return (
    <>
      <PageHeader title="New request" description="Choose the kind of approval you need." />
      {types.length === 0 ? (
        <EmptyState title="No approval types yet" body="IT is setting up the approval types. Ask itadmin@arssteels.co.in if you need one now." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {types.map((type) => (
            <Link key={type.id} href={`/users/new/${type.id}`} className="card block p-5 hover:border-primary-600">
              <p className="font-semibold">{type.name}</p>
              <p className="mt-1 text-label text-ink-muted">{type.description ?? "No description."}</p>
              <p className="mt-3 text-caption text-ink-faint">Numbers look like {type.requestPrefix}-2026-000001</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
