"use client";

import { useEffect } from "react";
import { userCommandAction } from "@/app/admin/users/actions";
import { SubmitButton, useActionForm } from "@/features/ui/form";
import { useToast } from "@/features/ui/Toast";

// v1.13.0 (D-166, owner): Re-invite and Reset password straight from the
// users list. The same server action as the user page; every rule is
// checked again on the server. Messages go by email only.
function RowCommand({ id, command, label, confirm, confirmLabel }: { id: number; command: "invite" | "reset-password"; label: string; confirm: string; confirmLabel: string }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(userCommandAction, { confirm, confirmTitle: `${label}?`, confirmLabel });
  const toast = useToast();
  // The answer shows as a notice, so the table row keeps its width.
  useEffect(() => {
    if (result?.message) toast({ tone: result.ok ? "success" : "error", title: result.ok ? `${label}: sent` : `${label}: not sent`, body: result.message });
  }, [result, label, toast]);
  return (
    // relative: the button's screen-reader status line is positioned
    // absolutely; it must belong to the table's scroll area, not the page.
    <form onSubmit={onSubmit} className="relative min-w-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="command" value={command} />
      <SubmitButton pending={pending} variant="secondary" className="btn-compact whitespace-nowrap">
        {label}
      </SubmitButton>
      {confirmBar}
    </form>
  );
}

export function UserRowActions({ id, name, email, signInMethod, hasPassword }: { id: number; name: string; email: string; signInMethod: "GOOGLE" | "PASSWORD"; hasPassword: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-2" data-testid={`user-actions-${id}`}>
      <RowCommand
        id={id}
        command="invite"
        label="Re-invite"
        confirm={signInMethod === "PASSWORD" ? `Email ${name} (${email}) an invitation with their User ID and a new set-password link? Older links stop working.` : `Email ${name} (${email}) an invitation to sign in with Google?`}
        confirmLabel="Yes, send"
      />
      {/* Before a first password, Re-invite sends the set-password link. */}
      {signInMethod === "PASSWORD" && hasPassword && (
        <RowCommand
          id={id}
          command="reset-password"
          label="Reset password"
          confirm={`Email ${name} (${email}) a link to choose a new password? Their current password keeps working until they do.`}
          confirmLabel="Yes, send"
        />
      )}
    </div>
  );
}
