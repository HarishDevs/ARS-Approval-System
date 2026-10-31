export type RoleCode = "SUPER_ADMIN" | "IT_ADMIN" | "USER" | "EXPORTER"; // EXPORTER: v1.7.0 (A9) "Can export"
// D-208 (owner): BOTH = the person may sign in with Google or with User ID +
// password + WhatsApp code. A sign-in attempt itself is always one of the two.
export type SignInMethod = "GOOGLE" | "PASSWORD" | "BOTH";
export type SignInAttempt = "GOOGLE" | "PASSWORD";
export const allowsGoogle = (method: SignInMethod) => method === "GOOGLE" || method === "BOTH";
export const allowsPassword = (method: SignInMethod) => method === "PASSWORD" || method === "BOTH";
export const SIGN_IN_LABEL: Record<SignInMethod, string> = { GOOGLE: "Google", PASSWORD: "Password + WhatsApp", BOTH: "Google or password + WhatsApp" };
// D-168 (AI module branch): the four modules a person may be given.
export type ModuleCode = "APPROVAL" | "TASK" | "INFORMATION" | "AI";
export type AuthMethod = "GOOGLE" | "PASSWORD_OTP" | "DEMO" | "TRY_AS";
export type AppArea = "users" | "admin" | "superadmin";

export interface AuthenticatedUser {
  id: number;
  loginId: string;
  name: string;
  email: string;
  whatsappNumber: string | null;
  signInMethod: SignInMethod;
  active: boolean;
  roles: RoleCode[];
  modules: ModuleCode[]; // D-168; the Super Admin is exempt from module checks
  // D-172 Pic bot - ai: chat modes and Salesforce record scope (see server/ai/chat-access.ts)
  chatModes: ("GENERAL" | "APPROVAL" | "TASK" | "INFORMATION" | "SALESFORCE" | "COMBINED")[];
  salesforceScope: "NONE" | "OWN" | "ALL";
  isDemo?: boolean; // D-071: a demo person the Super Admin is trying the app as
  triedBy?: string | null; // D-185: a view-only Try as session, opened by this admin
  isBreakGlass?: boolean; // D-246: the break-glass account (its changes alert the Super Admins)
}

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  deviceKey: string | null;
  // D-250: what the browser says it is (installed app / touch phone or tablet).
  clientKind?: "app" | "handheld" | null;
}
