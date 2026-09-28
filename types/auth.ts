export type RoleCode = "SUPER_ADMIN" | "IT_ADMIN" | "USER";
export type SignInMethod = "GOOGLE" | "PASSWORD";
export type AuthMethod = "GOOGLE" | "PASSWORD_OTP";
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
}

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  deviceKey: string | null;
}
