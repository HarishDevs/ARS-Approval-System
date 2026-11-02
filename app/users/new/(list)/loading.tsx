import { ScreenLoading } from "@/features/mobile/MobileSkeletons";

// FB-01. In a route group so it never wraps the detail pages, which must
// still answer a plain 404 to outsiders (D-016).
export default function Loading() {
  return <ScreenLoading screen="page" desktop="list" label="Loading approval types…" />;
}
