"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { setFlag } from "@/lib/db/repositories/user-flags.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// First-use checklist done (#13): stored for this person on the server, so it
// stays hidden on every device.
export async function dismissOnboardingAction(): Promise<ActionResult> {
  try {
    const session = await requireApiArea("users");
    await setFlag(session.user.id, "ONBOARDING_DONE");
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("dismissOnboardingAction failed", error);
    return { ok: false, message: "Couldn't save that. Please try again." };
  }
  revalidatePath("/users");
  return { ok: true, message: "Hidden. The help page has all of this whenever you need it." };
}
