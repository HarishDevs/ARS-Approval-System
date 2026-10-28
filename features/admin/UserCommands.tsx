"use client";

import { userCommandAction } from "@/app/admin/users/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";

// Account actions on the user page (F-06). Each is a tiny form so it works
// without client-side routing and is checked again on the server.
// D-179: `body` (what it does) is a hover hint; `meta` (a fact) stays visible.
function Command({ id, command, label, body, meta, danger, confirm, confirmLabel }: { id: number; command: string; label: string; body: string; meta?: string; danger?: boolean; confirm?: string; confirmLabel?: string }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(userCommandAction, { confirm, confirmTitle: `${label}?`, confirmLabel, confirmTone: danger ? "danger" : "primary" });
  return (
    <form onSubmit={onSubmit} className="space-y-2 px-5 py-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="command" value={command} />
      <div className="flex items-center gap-1.5">
        <p className="font-medium">{label}</p>
        <Hint text={body} align="start" />
      </div>
      {meta && <p className="text-label text-ink-muted">{meta}</p>}
      <SubmitButton pending={pending} variant="secondary" className={`btn-compact ${danger ? "text-danger-600" : ""}`}>
        {label}
      </SubmitButton>
      {confirmBar}
      <ResultMessage result={result} />
    </form>
  );
}

export function UserCommands({
  id,
  name,
  active,
  locked,
  signInMethod,
  hasPassword,
  openSessionCount,
  canEdit,
}: {
  id: number;
  name: string;
  active: boolean;
  locked: boolean;
  signInMethod: "GOOGLE" | "PASSWORD" | "BOTH";
  hasPassword: boolean;
  openSessionCount: number;
  canEdit: boolean;
}) {
  if (!canEdit) {
    return (
      <section className="card px-5 py-4 text-label text-ink-muted">Only the Super Admin can change this account.</section>
    );
  }
  return (
    <section className="card divide-y divide-line">
      <h2 className="px-5 py-4 font-semibold">Account actions</h2>
      {/* v1.13.0 (D-166): invitations and resets by email. */}
      {active && (
        <Command
          id={id}
          command="invite"
          label="Re-invite"
          body={signInMethod !== "GOOGLE" ? "Emails a welcome with their User ID and a link (valid 72 hours) to set their password, confirmed by a WhatsApp code. Older links stop working." : "Emails a welcome telling them to sign in with Google as their email on record."}
        />
      )}
      {active && signInMethod !== "GOOGLE" &&
        (hasPassword ? (
          <Command
            id={id}
            command="reset-password"
            label="Reset password"
            body="Emails a link (valid 72 hours) to choose a new password, confirmed by a WhatsApp code. Their current password keeps working until then. Older links stop working."
            confirm={`Email ${name} a link to reset their password?`}
            confirmLabel="Yes, send"
          />
        ) : (
          <Command id={id} command="set-password-link" label="Send set-password link" body="Emails a link (valid 72 hours) to set a password, confirmed by a WhatsApp code. Older links stop working." />
        ))}
      {locked && <Command id={id} command="unlock" label="Unlock account" body="Clears a lock from wrong passwords or from “This wasn't me”." />}
      {active && (
        <Command id={id} command="signout" label="Sign out everywhere" body="Ends every open session." meta={`${openSessionCount} open session${openSessionCount === 1 ? "" : "s"} now.`} confirm={`Sign ${name} out on every device?`} confirmLabel="Yes, sign out" />
      )}
      {active ? (
        <Command
          id={id}
          command="deactivate"
          label="Deactivate user"
          body="Blocks sign-in and ends every session. History is kept; you can reactivate later."
          danger
          confirm={`Deactivate ${name}? They will be signed out everywhere and can't sign in.`}
          confirmLabel="Yes, deactivate"
        />
      ) : (
        <Command id={id} command="reactivate" label="Reactivate user" body="Allows sign-in again." />
      )}
    </section>
  );
}
