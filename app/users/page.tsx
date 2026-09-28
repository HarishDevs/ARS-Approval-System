import { requireArea } from "@/server/authorization/guards";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";

export default async function UsersHome() {
  const { user } = await requireArea("users");
  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} description="Raise requests, track every level of approval, and act on what's waiting for you." />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "My open requests", value: 0 },
          { label: "Waiting for me", value: 0 },
          { label: "Changes asked", value: 0 },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-line bg-surface p-5">
            <p className="text-label text-ink-muted">{stat.label}</p>
            <p className="mt-2 text-display font-bold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <EmptyState
          title="Requests arrive in the next build step"
          body="Sign-in is working. Creating requests, multi-level approval routing and your approval queue are being built next."
        />
      </div>
    </>
  );
}
