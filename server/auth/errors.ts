// Messages are generic by design: they never reveal whether a user ID,
// email or number exists (anti-enumeration).
export type AuthErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_ACCOUNT_LOCKED"
  | "AUTH_INVALID_TOKEN"
  | "AUTH_NOT_ALLOWED"
  | "AUTH_NO_WHATSAPP"
  | "AUTH_OTP_COOLDOWN"
  | "AUTH_OTP_RATE_LIMITED"
  | "AUTH_OTP_DELIVERY_FAILED"
  | "AUTH_INVALID_OTP"
  | "AUTH_OTP_LOCKED"
  | "AUTH_CHALLENGE_EXPIRED"
  | "AUTH_PASSWORD_MISMATCH"
  | "AUTH_PASSWORD_POLICY"
  | "AUTH_LINK_INVALID"
  | "AUTH_RATE_LIMITED";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
    // v1.54.6 (Google sign-in fix): why, as a fixed code (UNKNOWN_ACCOUNT,
    // INACTIVE…) so the browser and IT can tell the cases apart.
    readonly reason?: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export const AUTH_ERROR_STATUS: Record<AuthErrorCode, number> = {
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_ACCOUNT_LOCKED: 423,
  AUTH_INVALID_TOKEN: 401,
  AUTH_NOT_ALLOWED: 403,
  AUTH_NO_WHATSAPP: 409,
  AUTH_OTP_COOLDOWN: 429,
  AUTH_OTP_RATE_LIMITED: 429,
  AUTH_OTP_DELIVERY_FAILED: 502,
  AUTH_INVALID_OTP: 401,
  AUTH_OTP_LOCKED: 429,
  AUTH_CHALLENGE_EXPIRED: 410,
  AUTH_PASSWORD_MISMATCH: 400,
  AUTH_PASSWORD_POLICY: 400,
  AUTH_LINK_INVALID: 410,
  AUTH_RATE_LIMITED: 429,
};

export const GENERIC_SIGN_IN_FAILED = "The user ID or password is incorrect.";
export const GENERIC_GOOGLE_FAILED = "This Google account can't sign in here. Ask IT to check your account.";

// v1.54.6 (Google sign-in fix): the person has just proved to Google that
// they own this email, so telling them why *their own* account can't sign in
// reveals nothing about anyone else (no enumeration). Messages name the cause
// and what to do; never internal details.
export const GOOGLE_REFUSAL_MESSAGE: Record<string, (email: string) => string> = {
  UNKNOWN_ACCOUNT: (email) => `No ARS CMS account uses ${email}. Sign in with the Google account of the email IT registered for you, or ask IT to add or correct your email.`,
  LINKED_ELSEWHERE: (email) => `The ARS CMS account for ${email} is linked to a different Google sign-in. Ask IT to reset its Google link, then try again.`,
  INACTIVE: () => "Your ARS CMS account is inactive. Please contact IT.",
  WRONG_METHOD: () => "Your ARS CMS account signs in with your User ID and password (and a WhatsApp code), not Google. Use that, or ask IT to allow Google sign-in.",
  EMAIL_NOT_VERIFIED: () => "Google hasn't verified this account's email address, so it can't be used here. Use a verified Google account.",
  NOT_GOOGLE_PROVIDER: () => "Please sign in with a Google account using Continue with Google.",
  BREAK_GLASS_DISABLED: () => GENERIC_GOOGLE_FAILED,
};

// "ra***@gmail.com": enough for IT to recognise who tried, without the full address in logs.
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  return `${local.slice(0, 2)}***@${domain}`.slice(0, 80);
}
