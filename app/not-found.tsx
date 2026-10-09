import Link from "next/link";

// Also shown for /admin and /superadmin when the user lacks the role, so
// those areas don't confirm they exist (D-016).
export default function NotFound() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="text-caption font-semibold uppercase tracking-wider text-ink-muted">404</p>
      <h1 className="text-title font-semibold">This page isn&apos;t available</h1>
      <p className="max-w-sm text-ink-muted">The link may be wrong, the item may have been removed, or it may not be shared with you.</p>
      <Link href="/users" className="link">
        Go to My work
      </Link>
    </main>
  );
}
