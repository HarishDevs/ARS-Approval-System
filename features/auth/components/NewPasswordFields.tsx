"use client";

import { useState } from "react";

// New password + confirmation, with a show/hide toggle (F-04).
export function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  minLength,
}: {
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
  minLength: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <div>
        <label htmlFor="new-password" className="field-label">
          New password
        </label>
        <div className="relative">
          <input
            id="new-password"
            name="new-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => onPassword(event.target.value)}
            className="field-input pr-16"
          />
          <button
            type="button"
            onClick={() => setShow((value) => !value)}
            className="absolute inset-y-0 right-3 my-auto h-8 px-1 text-label font-semibold text-primary-600"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <p className="mt-1.5 text-caption text-ink-muted">At least {minLength} characters, with letters and numbers.</p>
      </div>
      <div>
        <label htmlFor="confirm-password" className="field-label">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          name="confirm-password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => onConfirm(event.target.value)}
          className="field-input"
        />
      </div>
    </>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-label text-danger-600">
      {message}
    </p>
  );
}

export function CodeField({ code, onCode }: { code: string; onCode: (value: string) => void }) {
  return (
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
        onChange={(event) => onCode(event.target.value.replace(/\D/g, ""))}
        className="field-input text-center text-[20px] tracking-[0.5em]"
      />
    </div>
  );
}
