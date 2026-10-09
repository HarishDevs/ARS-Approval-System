import { PageSkeleton } from "@/features/ui/Skeleton";

// FB-01. In a route group so it never wraps the detail pages, which must
// still answer a plain 404 to outsiders (D-016).
export default function Loading() {
  return <PageSkeleton kind="list" label="Loading approval types…" />;
}
