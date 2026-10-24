import "server-only";
import { getSettingValue } from "@/server/settings/values";
import { featureOn } from "@/server/settings/features";
import { getConnection } from "@/lib/db/repositories/salesforce.repository";
import { CHAT_MODES, effectiveModes, type ChatMode, type ChatPerson, type ChatPolicy } from "@/server/ai/chat-access";

// D-172: the administrator side of Pic bot access, read fresh on every
// request (no caching), so switching something off applies to open chats at once.
export async function loadChatPolicy(person: { roles: readonly string[] }): Promise<ChatPolicy> {
  const [stop, aiOn, general, combined, moduleModes, connection] = await Promise.all([
    getSettingValue("ai.emergency_stop"),
    featureOn("ai", person),
    getSettingValue("ai.general_chat"),
    getSettingValue("ai.combined_chat"),
    getSettingValue("ai.module_modes"),
    getConnection().catch(() => null),
  ]);
  return {
    emergencyStop: stop === "ON",
    aiFeatureOn: aiOn,
    generalChat: general === "ON",
    combinedChat: combined === "ON",
    moduleModes: CHAT_MODES.filter((mode) => (moduleModes ?? "").split(",").includes(mode)),
    salesforceConnected: connection?.status === "CONNECTED",
  };
}

export async function chatAccess(person: ChatPerson): Promise<{ policy: ChatPolicy; modes: ChatMode[] }> {
  const policy = await loadChatPolicy(person);
  return { policy, modes: effectiveModes(person, policy) };
}
