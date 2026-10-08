import { redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";

export default async function DashboardsHome() {
  await requireArea("admin");
  redirect("/admin/dashboards/utilisation");
}
