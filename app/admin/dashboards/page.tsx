import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Dashboards" };

export default async function DashboardsHome() {
  await requireArea("admin");
  redirect("/admin/dashboards/utilisation");
}
