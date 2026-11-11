"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { bulkUserCommandAction } from "@/app/admin/users/actions";
import { ResultMessage, useActionForm } from "@/features/ui/form";
import { Spinner } from "@/features/ui/Spinner";
import { clearTicks, SelectAllBox, useTickedCount } from "@/features/ui/BulkSelect";

// v1.49.6 (owner: "multiselect and action should be needed in user page as
// well"): tick users in the list, then one action for all of them. Each asks
// first; the server checks every person as for the row menu.
export const USERS_BULK_FORM = "bulk-users";
type BulkCommand = "invite" | "set-password-link" | "deactivate" | "reactivate" | "modules";
const ACTIONS: {
  command: BulkCommand;
  label: string;
  confirm: (n: number) => string;
  danger?: boolean;
}[] = [
  {
    command: "invite",
    label: "Re-invite",
    confirm: (n) => `Email ${n} user${n === 1 ? "" : "s"} a welcome with their User ID and a set-password link (valid 12 hours)? Google-only users are told to sign in with Google.`,
  },
  {
    command: "set-password-link",
    label: "Send set-password link",
    confirm: (n) => `Email ${n} user${n === 1 ? "" : "s"} a set-password link (valid 12 hours)? Older links stop working.`,
  },
  {
    command: "deactivate",
    label: "Deactivate",
    confirm: (n) => `Deactivate ${n} user${n === 1 ? "" : "s"}? They are signed out everywhere and can't sign in until activated.`,
    danger: true,
  },
  {
    command: "reactivate",
    label: "Activate",
    confirm: (n) => `Activate ${n} user${n === 1 ? "" : "s"}?`,
  },
];

export function SelectAllUsers() {
  return <SelectAllBox formId={USERS_BULK_FORM} label="Select all users on this page" testId="select-all-users" />;
}

// v1.51.1 (owner): give or take modules for every ticked user at once.
const CHANGE_LABEL: Record<"ADD" | "REMOVE" | "SET", string> = { ADD: "Give these modules", REMOVE: "Take these modules away", SET: "Make these their only modules" };

export function UsersBulkActions({ modules = [] }: { modules?: { code: string; label: string; help: string }[] }) {
  const [change, setChange] = useState<"ADD" | "REMOVE" | "SET">("ADD");
  const count = useTickedCount(USERS_BULK_FORM);
  const [asking, setAsking] = useState<BulkCommand | null>(null);
  const { result, pending, onSubmit } = useActionForm(bulkUserCommandAction);
  const router = useRouter();
  const chosen = ACTIONS.find((action) => action.command === asking) ?? null;

  useEffect(() => {
    if (result?.data?.done) {
      setAsking(null);
      clearTicks(USERS_BULK_FORM);
      router.refresh();
    }
  }, [result, router]);
  useEffect(() => {
    if (count === 0) setAsking(null);
  }, [count]);

  return (
    <form id={USERS_BULK_FORM} onSubmit={onSubmit} aria-label="Act on selected users" className="mb-3 space-y-2" data-testid="users-bulk">
      {result && <ResultMessage result={result} />}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-2">
        <label className="flex items-center gap-2 text-label">
          <SelectAllUsers />
          <span>{count > 0 ? `${count} selected` : "Select all on this page"}</span>
        </label>
        {count > 0 && !chosen && (
          <>
            {modules.length > 0 && (
              <button type="button" onClick={() => setAsking("modules")} className="btn-secondary btn-compact" data-testid="bulk-modules">
                Modules
              </button>
            )}
            {ACTIONS.map((action) => (
              <button key={action.command} type="button" onClick={() => setAsking(action.command)} className={action.danger ? "btn-danger-quiet btn-compact" : "btn-secondary btn-compact"}>
                {action.label}
              </button>
            ))}
            <button type="button" onClick={() => clearTicks(USERS_BULK_FORM)} className="btn-ghost btn-compact">
              Clear
            </button>
          </>
        )}
      </div>
      {asking === "modules" && count > 0 && (
        <div className="space-y-3 rounded-md border border-line bg-surface-muted p-3" role="group" aria-label="Modules for the selected users">
          <input type="hidden" name="command" value="modules" />
          <fieldset>
            <legend className="mb-1 text-label font-semibold">For the {count} selected user{count === 1 ? "" : "s"}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(Object.keys(CHANGE_LABEL) as ("ADD" | "REMOVE" | "SET")[]).map((key) => (
                <label key={key} className="flex items-center gap-1.5 text-label">
                  <input type="radio" name="change" value={key} checked={change === key} onChange={() => setChange(key)} /> {CHANGE_LABEL[key]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-label font-semibold">Modules</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {modules.map((module) => (
                <label key={module.code} className="flex items-center gap-1.5 text-label" title={module.help}>
                  <input type="checkbox" name="modules" value={module.code} /> {module.label}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-caption text-ink-muted">Your own access and other IT Admins&apos; (unless you are the Super Admin) are left as they are.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="btn-primary btn-compact inline-flex h-9 items-center gap-2">
              {pending && <Spinner />}
              {pending ? "Working…" : `Apply to ${count}`}
            </button>
            <button type="button" disabled={pending} onClick={() => setAsking(null)} className="btn-secondary btn-compact">
              Cancel
            </button>
          </div>
        </div>
      )}
      {chosen && count > 0 && (
        <div className={`space-y-2 rounded-md border p-3 ${chosen.danger ? "border-danger-200 bg-danger-50" : "border-line bg-surface-muted"}`} role="alertdialog" aria-label={chosen.label}>
          <p className="text-label font-semibold">{chosen.confirm(count)}</p>
          <input type="hidden" name="command" value={chosen.command} />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className={`btn-compact inline-flex h-9 items-center gap-2 ${chosen.danger ? "rounded-md bg-danger-solid px-3 text-label font-semibold text-on-solid hover:bg-danger-solid-hover disabled:opacity-60" : "btn-primary"}`}
            >
              {pending && <Spinner />}
              {pending ? "Working…" : `Yes, ${chosen.label.toLowerCase()} ${count}`}
            </button>
            <button type="button" disabled={pending} onClick={() => setAsking(null)} className="btn-secondary btn-compact">
              Cancel
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
