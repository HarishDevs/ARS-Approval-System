"use client";

import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

// Browser side only: gets a Google ID token, which proves nothing until the
// server verifies it. Popup flow, not redirect: Chrome's bounce-tracking
// protection can wipe the redirect state (Power BI site, 2026-09-11).
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export async function signInWithGoogleGetIdToken(): Promise<string> {
  const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(getAuth(firebaseApp), provider);
  return result.user.getIdToken();
}
