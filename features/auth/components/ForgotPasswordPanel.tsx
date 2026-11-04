"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/features/auth/components/auth-client";
import { CodeField, ErrorBox, NewPasswordFields } from "@/features/auth/components/NewPasswordFields";
import { BrandLoader } from "@/features/ui/BrandLoader";

type Started = { challengeToken: string; expiresInSeconds: number };

// F-04 forgot password. The first answer is the same whether or not the
// User ID exists, so the wording never confirms an account.
export function ForgotPasswordPanel({ minLength }: { minLength: number }) {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [started, setStarted] = useState<Started | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [entering, setEntering] = useState(false);

  async function start(event?: React.FormEvent) {
    event?.preventDefault();
    setError(null);
    setBusy(true);
    const body = await postJson<Started>("/api/auth/forgot/start", { loginId });
    setBusy(false);
    if (body.success) {
      setStarted(body.data);
      setCode("");
    } else setError(body.error.message);
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault();
    if (!started) return;
    setError(null);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    const body = await postJson<{ redirectTo: string }>("/api/auth/forgot/complete", { challengeToken: started.challengeToken, code, password, confirm });
    setBusy(false);
    if (body.success) {
      setEntering(true);
      router.replace(body.data.redirectTo);
      router.refresh();
    } else setError(body.error.message);
  }

  // D-214: from a successful finish until the first page arrives.
  if (entering) return <BrandLoader variant="screen" title="Signing you in…" detail="Preparing your workspace" />;

  if (started) {
    return (
      <div className="mt-8">
        <h1 className="text-display font-bold">Check WhatsApp</h1>
        <p className="mt-2 text-[length:calc(15px*var(--text-scale,1))] text-ink-muted">
          If <span className="font-semibold text-ink">{loginId}</span> is a password account, we sent a code to its WhatsApp number. It works for{" "}
          {Math.round(started.expiresInSeconds / 60)} minutes.
        </p>
        <form onSubmit={finish} className="mt-8 space-y-5" noValidate>
          <CodeField code={code} onCode={setCode} />
          <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} minLength={minLength} />
          <ErrorBox message={error} />
          <button type="submit" disabled={busy || code.length < 4 || !password || !confirm} className="btn-primary">
            {busy ? "Saving…" : "Reset password and sign in"}
          </button>
        </form>
        <div className="mt-5 flex items-center justify-between text-label">
          <button type="button" onClick={() => setStarted(null)} className="link">
            Use a different User ID
          </button>
          <button type="button" onClick={() => start()} disabled={busy} className="link">
            Send a new code
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h1 className="text-display font-bold">Forgot password</h1>
      <p className="mt-2 text-[length:calc(15px*var(--text-scale,1))] text-ink-muted">Enter your User ID, mobile number or email. We&apos;ll send a code to the WhatsApp number IT has on file.</p>
      <form onSubmit={start} className="mt-8 space-y-5" noValidate>
        <div>
          {/* v1.49.5 (owner): the User ID, the mobile number or the email; the password and WhatsApp code are still asked. */}
          <label htmlFor="loginId" className="field-label">
            User ID, mobile number or email
          </label>
          <input
            id="loginId"
            name="username"
            autoComplete="username"
            required
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="e.g. RAVI01, 98765 43210 or name@arssteels.co.in"
            className="field-input"
          />
        </div>
        <ErrorBox message={error} />
        <button type="submit" disabled={busy || !loginId.trim()} className="btn-primary">
          {busy ? "Sending…" : "Send code"}
        </button>
      </form>
      <p className="mt-5 text-label text-ink-muted">
        Signing in with Google? You don&apos;t need a password. <Link href="/login" className="link">Back to sign in</Link>
      </p>
    </div>
  );
}
