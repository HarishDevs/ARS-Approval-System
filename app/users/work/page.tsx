import { redirect } from "next/navigation";
import { workPage } from "@/server/work/page-context";

export const dynamic = "force-dynamic";

// D-236 (owner): Task home is merged into Home (/users), which shows the
// task sections under the approvals. Old links keep their tabs and task.
export default async function WorkHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await workPage();
  const params = await searchParams;
  const keep = Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string" && ["tab", "given", "task"].includes(entry[0]));
  const query = new URLSearchParams(keep).toString();
  redirect(`/users${query ? `?${query}` : ""}`);
}
