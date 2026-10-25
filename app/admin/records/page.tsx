import { redirect } from "next/navigation";

// D-191: Records opens on the approval requests.
export default function Page() {
  redirect("/admin/records/requests");
}
