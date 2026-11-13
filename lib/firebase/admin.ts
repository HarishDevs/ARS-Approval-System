import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getEnv } from "@/config/environment";

// Verifies Google ID tokens from the browser. Firebase is only the identity
// check; ARS MySQL decides whether the account exists and what it may do.
// Project power-bi-dashboard-3b29f is reused from the Power BI site (D-038).
let app: App | undefined;

// The key as pasted into a hosting secrets screen can arrive with its
// surrounding quotes, with literal "\n" sequences, or with real line breaks
// (or \r\n). Firebase needs plain PEM with real line breaks.
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
  return `${key.replace(/\\r\\n|\\n/g, "\n").replace(/\r\n/g, "\n").trim()}\n`;
}

const unquote = (value: string) => value.trim().replace(/^["']|["']$/g, "");

function getFirebaseAdminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }
  const env = getEnv();
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    throw new Error("Firebase Admin is not configured (FIREBASE_* env vars).");
  }
  app = initializeApp({
    credential: cert({
      projectId: unquote(env.FIREBASE_PROJECT_ID),
      clientEmail: unquote(env.FIREBASE_CLIENT_EMAIL),
      privateKey: normalizePrivateKey(env.FIREBASE_PRIVATE_KEY),
    }),
  });
  return app;
}

export interface VerifiedGoogleIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  // How the person signed in to Firebase, e.g. "google.com" (audit P-03).
  provider: string | null;
  // v1.54.7: the Google account's permanent id ("sub"), from Firebase's
  // verified identities; unchanged when the person's primary email changes.
  googleSub?: string | null;
  // Every email Firebase lists for this identity (the token's own first).
  emails?: string[];
}

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleIdentity> {
  const decoded = await getAuth(getFirebaseAdminApp()).verifyIdToken(idToken, true);
  const identities = (decoded.firebase?.identities ?? {}) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : []);
  const googleSub = list(identities["google.com"])[0] ?? null;
  const emails = [...new Set([decoded.email ?? "", ...list(identities.email)].map((value) => value.trim().toLowerCase()).filter(Boolean))];
  return { uid: decoded.uid, email: decoded.email ?? null, emailVerified: decoded.email_verified ?? false, provider: decoded.firebase?.sign_in_provider ?? null, googleSub: googleSub && googleSub.length <= 64 ? googleSub : null, emails };
}
