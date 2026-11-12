import type { Metadata } from "next";
import { TaskListScreen } from "@/features/modules/TaskListScreen";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Assigned by me" };

export const dynamic = "force-dynamic";

// v1.9.0 (D-143): a task list; the screen checks access itself.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TaskListScreen base="CREATED" query={await searchParams} />;
}
