// Wording for the security notifications (N-02 to N-04). Email text is
// ready now; WhatsApp uses the owner's templates once supplied and approved
// (Q-013), filled from the variable keys below.
export interface SignInDetails {
  userName: string;
  when: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

export function formatIndiaTime(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

// A short, readable device description from the user-agent string.
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iOS"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "unknown OS";
  return `${browser} on ${os}`;
}

export function newSignInMessage(details: SignInDetails, notMeLink: string) {
  const when = formatIndiaTime(details.when);
  const device = describeDevice(details.userAgent);
  const ip = details.ipAddress ?? "unknown";
  const text = [
    `Hi ${details.userName},`,
    "",
    "There was a new sign-in to your ARS Approvals account.",
    `When: ${when}`,
    `Device: ${device}`,
    `IP address: ${ip}`,
    "",
    "If this was you, no action is needed.",
    `If it wasn't you, open this link to sign out everywhere and lock your account: ${notMeLink}`,
  ].join("\n");
  return {
    title: "New sign-in to your account",
    message: `New sign-in on ${device} at ${when}.`,
    email: { subject: "New sign-in to your ARS Approvals account", text },
    whatsappVariables: { user_name: details.userName, time: when, device, ip_address: ip, link: notMeLink },
  };
}

export function accountLockedMessage(userName: string, minutes: number) {
  const text = [
    `Hi ${userName},`,
    "",
    `Your ARS Approvals account was locked for ${minutes} minutes after too many wrong passwords.`,
    "If this wasn't you, contact IT (itadmin@arssteels.co.in).",
  ].join("\n");
  return {
    title: "Account locked",
    message: `Locked for ${minutes} minutes after too many wrong passwords.`,
    email: { subject: "Your ARS Approvals account was locked", text },
    whatsappVariables: { user_name: userName, minutes: String(minutes) },
  };
}

export function superAdminSignInMessage(adminName: string, details: SignInDetails) {
  const when = formatIndiaTime(details.when);
  const device = describeDevice(details.userAgent);
  const text = [
    `Super Admin sign-in: ${adminName}`,
    `When: ${when}`,
    `Device: ${device}`,
    `IP address: ${details.ipAddress ?? "unknown"}`,
  ].join("\n");
  return {
    title: "Super Admin sign-in",
    message: `${adminName} signed in on ${device} at ${when}.`,
    email: { subject: "Super Admin sign-in", text },
    whatsappVariables: { user_name: adminName, time: when, device, ip_address: details.ipAddress ?? "unknown" },
  };
}

export function accountSecuredMessage(userName: string) {
  const text = [
    `Hi ${userName},`,
    "",
    "You reported a sign-in that wasn't you. We signed your account out everywhere and locked it.",
    "IT will contact you to unlock it (itadmin@arssteels.co.in).",
  ].join("\n");
  return {
    title: "Account secured",
    message: "Signed out everywhere and locked after your report.",
    email: { subject: "Your ARS Approvals account was secured", text },
    whatsappVariables: { user_name: userName },
  };
}
