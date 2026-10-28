"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GoogleButton } from "@/features/auth/components/GoogleButton";
import { safeNextPath } from "@/lib/http/safe-next";
import { postJson } from "@/features/auth/components/auth-client";

type Challenge = { challengeToken: string; maskedNumber: string; expiresInSeconds: number; resendAfterSeconds: number };
// The shared helper: a dropped connection becomes a message, never a stuck button.
const post = postJson;

export function SignInPanel({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [challenge, setChallenge] = useState<Challenge | null>(null);

  function finish(redirectTo: string) {
    const safe = safeNextPath(nextPath);
    router.replace(safe !== "/users" ? safe : redirectTo);
    router.refresh();
  }

  return (
    <div className="mt-8">
      {challenge ? (
        <OtpStep challenge={challenge} onChallenge={setChallenge} onBack={() => setChallenge(null)} onDone={finish} />
      ) : (
        <PasswordStep onChallenge={setChallenge} onDone={finish} />
      )}
    </div>
  );
}

function PasswordStep({ onChallenge, onDone }: { onChallenge: (c: Challenge) => void; onDone: (to: string) => void }) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const body = await post<Challenge>("/api/auth/password/start", { loginId, password });
    setBusy(false);
    if (body.success) onChallenge(body.data);
    else setError(body.error.message);
  }

  return (
    <>
      <h1 className="text-display font-bold">Welcome back</h1>
      <p className="mt-2 text-[length:calc(15px*var(--text-scale,1))] text-ink-muted">Sign in to ARS-CMS</p>

      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        <div>
          <label htmlFor="loginId" className="field-label">
            User ID
          </label>
          <input
            id="loginId"
            name="username"
            autoComplete="username"
            required
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="Your user ID"
            className="field-input"
          />
        </div>
        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field-input pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-3 my-auto h-8 px-1 text-label font-semibold text-primary-600"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <div className="mt-2 flex justify-end">
            <Link href="/forgot-password" className="link text-label">
              Forgot password?
            </Link>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-label text-danger-600">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || !loginId || !password} className="btn-primary">
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-label text-ink-faint">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <GoogleButton onDone={onDone} />
    </>
  );
}

function OtpStep({
  challenge,
  onChallenge,
  onBack,
  onDone,
}: {
  challenge: Challenge;
  onChallenge: (c: Challenge) => void;
  onBack: () => void;
  onDone: (to: string) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(challenge.resendAfterSeconds);

  useEffect(() => {
    setResendIn(challenge.resendAfterSeconds);
    const timer = setInterval(() => setResendIn((seconds) => (seconds > 0 ? seconds - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const body = await post<{ redirectTo: string }>("/api/auth/password/verify", { challengeToken: challenge.challengeToken, code });
    setBusy(false);
    if (body.success) onDone(body.data.redirectTo);
    else setError(body.error.message);
  }

  async function resend() {
    setError(null);
    setInfo(null);
    const body = await post<Challenge>("/api/auth/password/resend", { challengeToken: challenge.challengeToken });
    if (body.success) {
      setCode("");
      setInfo("A new code was sent.");
      onChallenge(body.data);
    } else setError(body.error.message);
  }

  return (
    <>
      <h1 className="text-display font-bold">Check WhatsApp</h1>
      <p className="mt-2 text-[length:calc(15px*var(--text-scale,1))] text-ink-muted">
        We sent a code to <span className="font-semibold text-ink">+{challenge.maskedNumber}</span>. It works for{" "}
        {Math.round(challenge.expiresInSeconds / 60)} minutes.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        <div>
          <label htmlFor="otp" className="field-label">
            WhatsApp code
          </label>
          <input
            id="otp"
            name="one-time-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            required
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            className="field-input text-center text-[length:calc(20px*var(--text-scale,1))] tracking-[0.5em]"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-label text-danger-600">
            {error}
          </p>
        )}
        {info && !error && <p className="text-label text-success-600">{info}</p>}

        <button type="submit" disabled={busy || code.length < 4} className="btn-primary">
          {busy ? "Verifying…" : "Sign in"}
        </button>
      </form>

      <div className="mt-5 flex items-center justify-between text-label">
        <button type="button" onClick={onBack} className="link">
          Use a different account
        </button>
        {resendIn > 0 ? (
          <span className="text-ink-muted">Resend code in {resendIn}s</span>
        ) : (
          <button type="button" onClick={resend} className="link">
            Resend code
          </button>
        )}
      </div>
    </>
  );
}
