import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { featureOn } from "@/server/settings/features";
import { TaskDetail } from "@/features/work/TaskDetail";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Task" };

export const dynamic = "force-dynamic";

// v1.9.0 (D-143): one task. Only the people on it, the managers above the
// assignee and IT can open it; anyone else gets "not found". v1.52.1: the
// page's content is TaskDetail, shared with the popup opened from lists.
export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; project?: string }> }) {
  const { user } = await requireArea("users");
  if (!(await featureOn("tasks", user))) notFound();
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  return <TaskDetail taskId={Number(id)} user={user} query={await searchParams} />;
}
