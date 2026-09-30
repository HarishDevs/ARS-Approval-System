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
  | "AUTH_LINK_INVALID";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
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
};

export const GENERIC_SIGN_IN_FAILED = "The user ID or password is incorrect.";
export const GENERIC_GOOGLE_FAILED = "This Google account can't sign in here. Ask IT to check your account.";
