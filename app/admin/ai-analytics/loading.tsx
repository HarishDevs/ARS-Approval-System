import { PageSkeleton } from "@/features/ui/Skeleton";

// D-233 (UI states): a skeleton while this page loads.
export default function Loading() {
  return <PageSkeleton kind="dashboard" label="Loading AI analytics…" />;
}
