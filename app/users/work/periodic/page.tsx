import type { Metadata } from "next";
import { TaskListScreen } from "@/features/modules/TaskListScreen";

export const metadata: Metadata = { title: "Periodic tasks" };
export const dynamic = "force-dynamic";

// D-219: every repeating task the person can see. v1.54.7 (owner: "add the
// Filter based pages view and filter sort option in the Periodic Task"): the
// same list as Assigned to me (tabs, Filter, Sort, Options, pages), with how
// it repeats, how many are done and Stop repeating.
export default async function PeriodicPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TaskListScreen base="PERIODIC" query={await searchParams} />;
}
