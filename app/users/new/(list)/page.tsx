import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { listWorkflows } from "@/lib/db/repositories/approvals.repository";
import { followUpSource } from "@/server/approvals/follow-up";
import { departmentOfUser, mayRaise } from "@/server/approvals/raisers";

// Pick an approval type: active, published predefined types (custom
// approvals made by users come in a later session, P5).
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ followUp?: string }> }) {
  const { user } = await requireArea("users");
  const raw = (await searchParams).followUp;
  const source = await followUpSource(raw && /^\d{1,10}$/.test(raw) ? Number(raw) : null, { id: user.id, roles: user.roles });
  const suffix = source ? `?followUp=${source.id}` : "";
  // v1.9.0 (D-147): only the types this person may raise.
  const departmentId = await departmentOfUser(user.id);
  const types = (await listWorkflows({ kind: "PREDEFINED" })).filter((item) => item.active && item.publishedVersionNo !== null && mayRaise(item.settings, { id: user.id, roles: user.roles, departmentId }));
  return (
    <>
      <PageHeader title="New request" description="Choose the kind of approval you need.">
        <Link href="/users/custom" className="btn-secondary btn-compact">
          Something else? Custom approval
        </Link>
      </PageHeader>
      {source && (
        <p role="status" className="mb-4 rounded-md bg-primary-50 px-3 py-2 text-label text-primary-700">
          Raising a follow-up to {source.requestNo}. Choose its type; matching details are copied in, and it goes through its own approval.
        </p>
      )}
      {types.length === 0 ? (
        <EmptyState title="No approval types yet" body="IT is setting up the approval types. Ask itadmin@arssteels.co.in if you need one now." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {types.map((type) => (
            <Link key={type.id} href={`/users/new/${type.id}${suffix}`} className="card block p-5 hover:border-primary-600">
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
