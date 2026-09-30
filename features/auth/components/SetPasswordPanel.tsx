"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/features/auth/components/auth-client";
import { CodeField, ErrorBox, NewPasswordFields } from "@/features/auth/components/NewPasswordFields";

type Challenge = { challengeToken: string; maskedNumber: string; expiresInSeconds: number };

// F-04 set password: new password → WhatsApp code → signed in. The password
// stays in this page's memory between the two steps and is re-checked on
// the server at the end.
export function SetPasswordPanel({ token, name, loginId, minLength }: { token: string; name: string; loginId: string; minLength: number }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    const body = await postJson<Challenge>("/api/auth/set-password/start", { token, password, confirm });
    setBusy(false);
    if (body.success) setChallenge(body.data);
    else setError(body.error.message);
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setError(null);
    setBusy(true);
    const body = await postJson<{ redirectTo: string }>("/api/auth/set-password/complete", {
      token,
      challengeToken: challenge.challengeToken,
      code,
      password,
      confirm,
    });
    setBusy(false);
    if (body.success) {
      router.replace(body.data.redirectTo);
      router.refresh();
    } else setError(body.error.message);
  }

  if (challenge) {
    return (
      <div className="mt-8">
        <h1 className="text-display font-bold">Check WhatsApp</h1>
        <p className="mt-2 text-[15px] text-ink-muted">
          We sent a code to <span className="font-semibold text-ink">+{challenge.maskedNumber}</span> to confirm this number is yours.
        </p>
        <form onSubmit={finish} className="mt-8 space-y-5" noValidate>
          <CodeField code={code} onCode={setCode} />
          <ErrorBox message={error} />
          <button type="submit" disabled={busy || code.length < 4} className="btn-primary">
            {busy ? "Saving…" : "Set password and sign in"}
          </button>
        </form>
        <button type="button" onClick={() => setChallenge(null)} className="link mt-5 text-label">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h1 className="text-display font-bold">Set your password</h1>
      <p className="mt-2 text-[15px] text-ink-muted">
        Hi {name}. Your User ID is <span className="font-semibold text-ink">{loginId}</span>.
      </p>
      <form onSubmit={sendCode} className="mt-8 space-y-5" noValidate>
        <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} minLength={minLength} />
        <ErrorBox message={error} />
        <button type="submit" disabled={busy || !password || !confirm} className="btn-primary">
          {busy ? "Sending code…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
