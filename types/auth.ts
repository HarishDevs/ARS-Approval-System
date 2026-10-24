export type RoleCode = "SUPER_ADMIN" | "IT_ADMIN" | "USER" | "EXPORTER"; // EXPORTER: v1.7.0 (A9) "Can export"
export type SignInMethod = "GOOGLE" | "PASSWORD";
// D-168 (AI module branch): the four modules a person may be given.
export type ModuleCode = "APPROVAL" | "TASK" | "INFORMATION" | "AI";
export type AuthMethod = "GOOGLE" | "PASSWORD_OTP" | "DEMO";
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
}

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  deviceKey: string | null;
}
