import "server-only";
import { getSettingValue } from "@/server/settings/values";

// Feature switches (Addendum B BI-01/02/06, D-124). ON for everyone, OFF for
// no one, IT_ONLY for the IT team and Super Admin (a trial). A switch is not
// an access check: every page and action still checks access on the server.
export type Feature = "analytics" | "reports" | "scheduled_reports" | "amendments" | "templates";

export async function featureMode(feature: Feature): Promise<"ON" | "OFF" | "IT_ONLY"> {
  const value = await getSettingValue(`features.${feature}`).catch(() => null);
  return value === "OFF" || value === "IT_ONLY" ? value : "ON";
}

export async function featureOn(feature: Feature, user: { roles: readonly string[] } | null): Promise<boolean> {
  const mode = await featureMode(feature);
  if (mode === "ON") return true;
  if (mode === "OFF" || !user) return false;
  return user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN");
}

export async function enabledFeatures(user: { roles: readonly string[] }): Promise<Record<Feature, boolean>> {
  const features: Feature[] = ["analytics", "reports", "scheduled_reports", "amendments", "templates"];
  const values = await Promise.all(features.map((feature) => featureOn(feature, user)));
  return Object.fromEntries(features.map((feature, index) => [feature, values[index]])) as Record<Feature, boolean>;
}

// v1.7.0 (A9): may this person download reports? A separate permission only
// when the Super Admin limits downloads to the "Can export" role.
export async function canExport(user: { roles: readonly string[] } | null): Promise<boolean> {
  if (!user) return false;
  const mode = await getSettingValue("features.exports").catch(() => null);
  if (mode !== "ROLE") return true;
  return user.roles.includes("EXPORTER") || user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN");
}
