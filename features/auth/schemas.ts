import { z } from "zod";

export const googleSignInSchema = z.object({ idToken: z.string().min(20).max(5000) });

export const passwordStartSchema = z.object({
  loginId: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const otpResendSchema = z.object({ challengeToken: z.string().min(20).max(200) });

export const otpVerifySchema = z.object({
  challengeToken: z.string().min(20).max(200),
  code: z.string().trim().regex(/^\d{4,8}$/, "Enter the code from WhatsApp."),
});

export const notMeSchema = z.object({ token: z.string().min(20).max(2000) });

// F-04 set password / forgot password.
const newPassword = { password: z.string().min(1).max(200), confirm: z.string().min(1).max(200) };
const code = z.string().trim().regex(/^\d{4,8}$/, "Enter the code from WhatsApp.");

export const setPasswordStartSchema = z.object({ token: z.string().min(20).max(200), ...newPassword });
export const setPasswordCompleteSchema = z.object({ token: z.string().min(20).max(200), challengeToken: z.string().min(20).max(200), code, ...newPassword });
export const forgotStartSchema = z.object({ loginId: z.string().trim().min(1).max(100) });
export const forgotCompleteSchema = z.object({ challengeToken: z.string().min(20).max(200), code, ...newPassword });
