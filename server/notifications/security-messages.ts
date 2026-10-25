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
    "There was a new sign-in to your ARS-CMS account.",
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
    email: { subject: "New sign-in to your ARS-CMS account", text },
    whatsappVariables: { user_name: details.userName, time: when, device, ip_address: ip, link: notMeLink },
  };
}

export function accountLockedMessage(userName: string, minutes: number) {
  const text = [
    `Hi ${userName},`,
    "",
    `Your ARS-CMS account was locked for ${minutes} minutes after too many wrong passwords.`,
    "If this wasn't you, contact IT (itadmin@arssteels.co.in).",
  ].join("\n");
  return {
    title: "Account locked",
    message: `Locked for ${minutes} minutes after too many wrong passwords.`,
    email: { subject: "Your ARS-CMS account was locked", text },
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
    email: { subject: "Your ARS-CMS account was secured", text },
    whatsappVariables: { user_name: userName },
  };
}

const IT_CONTACT = "If you didn't expect this, contact IT (itadmin@arssteels.co.in).";

export function whatsappChangedMessage(userName: string) {
  const text = [`Hi ${userName},`, "", "The WhatsApp number on your ARS-CMS account was changed by IT.", IT_CONTACT].join("\n");
  return {
    title: "WhatsApp number changed",
    message: "The WhatsApp number on your account was changed.",
    email: { subject: "Your WhatsApp number was changed", text },
    whatsappVariables: { user_name: userName },
  };
}

export function signInMethodChangedMessage(userName: string, method: "GOOGLE" | "PASSWORD") {
  const how = method === "GOOGLE" ? "your Google account" : "your User ID and password, with a code on WhatsApp";
  const text = [`Hi ${userName},`, "", `IT changed how you sign in to ARS-CMS. You now sign in with ${how}.`, IT_CONTACT].join("\n");
  return {
    title: "Sign-in method changed",
    message: `You now sign in with ${method === "GOOGLE" ? "Google" : "User ID and password"}.`,
    email: { subject: "How you sign in to ARS-CMS has changed", text },
    whatsappVariables: { user_name: userName, method: method === "GOOGLE" ? "Google" : "User ID and password" },
  };
}

export function setPasswordLinkMessage(userName: string, loginId: string, link: string, validHours: number) {
  const text = [
    `Hi ${userName},`,
    "",
    "An ARS-CMS account is ready for you.",
    `Your User ID: ${loginId}`,
    `Set your password here (valid for ${validHours} hours): ${link}`,
    "You'll confirm it with a code sent to your WhatsApp.",
    "",
    IT_CONTACT,
  ].join("\n");
  return {
    title: "Set your password",
    message: "Use the link in your email to set your password.",
    email: { subject: "Set your ARS-CMS password", text },
    whatsappVariables: null,
  };
}

// v1.13.0 (D-166): invitation emails. A Google user signs in with Google
// as the email on record; a password user gets their User ID and a
// set-password link (the WhatsApp code still confirms it, D-025).
export function googleInvitationMessage(userName: string, email: string, signInUrl: string) {
  const text = [
    `Hi ${userName},`,
    "",
    "You've been added to ARS-CMS, where ARS raises and approves requests.",
    `Sign in here: ${signInUrl}`,
    `Choose "Sign in with Google" and use this Google account: ${email}`,
    "",
    "Questions? Contact IT (itadmin@arssteels.co.in).",
  ].join("\n");
  return {
    title: "Welcome to ARS-CMS",
    message: `Sign in with Google as ${email}.`,
    email: { subject: "You've been added to ARS-CMS", text },
    whatsappVariables: null,
  };
}

export function passwordInvitationMessage(userName: string, loginId: string, link: string, validHours: number) {
  const text = [
    `Hi ${userName},`,
    "",
    "You've been added to ARS-CMS, where ARS raises and approves requests.",
    `Your User ID: ${loginId}`,
    `Set your password here (valid for ${validHours} hours): ${link}`,
    "You'll confirm it with a code sent to your WhatsApp. After that you sign in with your User ID and password.",
    "",
    "Questions? Contact IT (itadmin@arssteels.co.in).",
  ].join("\n");
  return {
    title: "Welcome to ARS-CMS",
    message: "Use the link in your email to set your password.",
    email: { subject: "You've been added to ARS-CMS", text },
    whatsappVariables: null,
  };
}

// v1.13.0 (D-166): IT reset the password. The old one keeps working until
// a new one is set, so a reset by mistake locks nobody out.
export function passwordResetLinkMessage(userName: string, loginId: string, link: string, validHours: number) {
  const text = [
    `Hi ${userName},`,
    "",
    "IT has sent you a link to reset your ARS-CMS password.",
    `Your User ID: ${loginId}`,
    `Choose a new password here (valid for ${validHours} hours): ${link}`,
    "You'll confirm it with a code sent to your WhatsApp. Until then your current password still works.",
    "",
    IT_CONTACT,
  ].join("\n");
  return {
    title: "Reset your password",
    message: "Use the link in your email to choose a new password.",
    email: { subject: "Reset your ARS-CMS password", text },
    whatsappVariables: null,
  };
}

export function passwordChangedMessage(userName: string, when: Date) {
  const text = [
    `Hi ${userName},`,
    "",
    `Your ARS-CMS password was set on ${formatIndiaTime(when)}. You were signed out on every device.`,
    IT_CONTACT,
  ].join("\n");
  return {
    title: "Password changed",
    message: "Your password was changed and every device was signed out.",
    email: { subject: "Your ARS-CMS password was changed", text },
    whatsappVariables: { user_name: userName, time: formatIndiaTime(when) },
  };
}
