export type RoleCode = "SUPER_ADMIN" | "IT_ADMIN" | "USER" | "EXPORTER"; // EXPORTER: v1.7.0 (A9) "Can export"
export type SignInMethod = "GOOGLE" | "PASSWORD";
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
  isDemo?: boolean; // D-071: a demo person the Super Admin is trying the app as
}

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  deviceKey: string | null;
}
