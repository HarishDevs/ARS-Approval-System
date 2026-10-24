import "server-only";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { featureOn } from "@/server/settings/features";

// D-168 (AI module branch): every AI page. requireArea already refuses
// people without the AI module (page access, D-168); the "ai" switch can
// turn the whole module off.
export async function requireAiPage() {
  const session = await requireArea("users");
  if (!(await featureOn("ai", session.user))) notFound();
  return session;
}
