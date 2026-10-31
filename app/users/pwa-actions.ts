"use server";

import { requireApiArea } from "@/server/authorization/guards";
import { setFlag } from "@/lib/db/repositories/user-flags.repository";
import { INSTALL_INVITE_FLAG } from "@/server/pwa/flags";

// D-251: "Maybe later" on the install invitation, remembered on the account
// so another device (or a cleared browser) doesn't ask again.
export async function dismissInstallInviteAction(): Promise<void> {
  const session = await requireApiArea("users", { change: false }).catch(() => null);
  if (!session) return;
  await setFlag(session.user.id, INSTALL_INVITE_FLAG);
}
