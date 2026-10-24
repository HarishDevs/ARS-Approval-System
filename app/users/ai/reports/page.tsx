import { redirect } from "next/navigation";

// D-180 (owner): the AI module is the assistant only; this address now opens it.
export default function Page() {
  redirect("/users/ai/assistant");
}
