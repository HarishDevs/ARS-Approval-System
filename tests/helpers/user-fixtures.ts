import type { UserRecord } from "@/lib/db/repositories/users.repository";

export function userRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 5,
    loginId: "EMP005",
    name: "Staff",
    email: "staff@example.com",
    whatsappNumber: "919876543210",
    signInMethod: "PASSWORD",
    firebaseUid: null,
    passwordHash: "scrypt$x",
    failedLoginCount: 0,
    lockedSecondsRemaining: 0,
    active: true,
    isBreakGlass: false,
    isDemo: false,
    breakGlassSecondsRemaining: 0,
    hasLoggedInBefore: true,
    roles: ["USER"],
    modules: ["APPROVAL", "TASK", "INFORMATION"],
    chatModes: ["APPROVAL", "TASK", "INFORMATION"],
    salesforceScope: "NONE",
    ...overrides,
  };
}
