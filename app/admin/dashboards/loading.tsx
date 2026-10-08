import { SkeletonBlock } from "@/features/ui/Spinner";

// Shown while a dashboard loads or a new filter is applied (S11-12).
export default function Loading() {
  return (
    <div role="status" aria-label="Loading the dashboard">
      <SkeletonBlock className="mb-3 h-8 w-64" />
      <SkeletonBlock className="mb-6 h-4 w-full max-w-xl" />
      <SkeletonBlock className="mb-6 h-20 w-full" />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <SkeletonBlock key={item} className="h-20" />
        ))}
      </div>
      <SkeletonBlock className="h-72 w-full" />
    </div>
  );
}
