"use client";

import { useState } from "react";
import { createUserAction, updateUserAction } from "@/app/admin/users/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";
import type { ModuleCode, RoleCode, SignInMethod } from "@/types/auth";
import { MODULE_HELP, MODULE_LABEL, MODULES } from "@/server/modules/modules";
import { CHAT_MODES, MODE_HELP, MODE_LABEL, type ChatMode, type SalesforceScope } from "@/server/ai/chat-access";

export interface Option {
  id: number;
  label: string;
}

export interface UserFormValues {
  id?: number;
  loginId: string;
  name: string;
  email: string;
  whatsappNumber: string | null;
  departmentId: number | null;
  designationId: number | null;
  reportingManagerId: number | null;
  signInMethod: SignInMethod;
  roles: RoleCode[];
  modules: ModuleCode[];
  chatModes: ChatMode[];
  salesforceScope: SalesforceScope;
}

const ROLE_INFO: { role: RoleCode; label: string; body: string }[] = [
  { role: "USER", label: "User", body: "Raise requests, create custom approvals, approve what is assigned. Everyone has this." },
  { role: "EXPORTER", label: "Can export", body: "Download reports (CSV, Excel, PDF) when downloads are limited to this permission." },
  { role: "IT_ADMIN", label: "IT Admin", body: "The Admin space: approval types, workflows, DoA, users and departments." },
  { role: "SUPER_ADMIN", label: "Super Admin", body: "Providers, security, audit log. Only a Super Admin can grant this." },
];

// F-06 create / edit user. Every rule is re-checked on the server (D-047);
// the disabled states here are only a convenience.
export function UserForm({
  mode,
  values,
  departments,
  designations,
  managers,
  canGrantSuperAdmin,
  readOnly,
  moduleLock,
}: {
  mode: "create" | "edit";
  values: UserFormValues;
  departments: Option[];
  designations: Option[];
  managers: Option[];
  canGrantSuperAdmin: boolean;
  readOnly: boolean;
  // D-168: why this admin can't change these modules (own account, another
  // IT Admin's without being Super Admin); null when they can.
  moduleLock?: string | null;
}) {
  const { result, pending, onSubmit } = useActionForm(mode === "create" ? createUserAction : updateUserAction);
  const [method, setMethod] = useState<SignInMethod>(values.signInMethod);

  return (
    <form onSubmit={onSubmit} className="card">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <fieldset disabled={readOnly} className="grid gap-5 px-5 py-5 sm:grid-cols-2">
        <Field label="Full name" name="name" defaultValue={values.name} result={result} autoComplete="off" />
        <Field label="User ID" name="loginId" defaultValue={values.loginId} result={result} hint="Used to sign in with a password. Letters, numbers, dot, dash, underscore." />
        <Field label="Email" name="email" type="email" defaultValue={values.email} result={result} hint="Any domain. For Google sign-in it must be the person's Google account." />
        <Field
          label="WhatsApp number"
          name="whatsappNumber"
          defaultValue={values.whatsappNumber ? `+${values.whatsappNumber}` : ""}
          result={result}
          hint={method !== "GOOGLE" ? "Required: sign-in codes go here. 10-digit Indian numbers get +91." : "Used for notifications. 10-digit Indian numbers get +91."}
        />

        <div className="sm:col-span-2">
          <p className="field-label">How they sign in</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["GOOGLE", "PASSWORD", "BOTH"] as const).map((option) => (
              <div key={option} className="relative">
                <label className={`flex cursor-pointer gap-3 rounded-md border p-3 pr-9 ${method === option ? "border-primary-600 bg-primary-50" : "border-line"}`}>
                  <input type="radio" name="signInMethod" value={option} checked={method === option} onChange={() => setMethod(option)} className="mt-1" />
                  <span className="font-medium">{option === "GOOGLE" ? "Google account" : option === "PASSWORD" ? "User ID + password" : "Both"}</span>
                </label>
                <CardHint text={option === "GOOGLE" ? "No code needed." : option === "PASSWORD" ? "Then a code on WhatsApp every time." : "Google, or User ID + password with a WhatsApp code, whichever they choose."} />
              </div>
            ))}
          </div>
          <FieldError result={result} name="signInMethod" />
        </div>

        <Select label="Department" name="departmentId" options={departments} defaultValue={values.departmentId} result={result} />
        <Select label="Designation" name="designationId" options={designations} defaultValue={values.designationId} result={result} />
        <Select label="Reports to" name="reportingManagerId" options={managers} defaultValue={values.reportingManagerId} result={result} emptyLabel="Nobody" />

        <div className="sm:col-span-2">
          <p className="field-label">Roles</p>
          <div className="space-y-2">
            {ROLE_INFO.map(({ role, label, body }) => {
              const locked = role === "USER" || (role === "SUPER_ADMIN" && !canGrantSuperAdmin);
              return (
                <div key={role} className="relative">
                  <label className={`flex gap-3 rounded-md border border-line p-3 pr-9 ${locked ? "opacity-70" : "cursor-pointer"}`}>
                    <input type="checkbox" name="roles" value={role} defaultChecked={values.roles.includes(role)} disabled={locked} className="mt-1" />
                    {/* A disabled checkbox isn't submitted, so keep its value. */}
                    {locked && values.roles.includes(role) && <input type="hidden" name="roles" value={role} />}
                    <span className="font-medium">{label}</span>
                  </label>
                  <CardHint text={body} />
                </div>
              );
            })}
          </div>
          <FieldError result={result} name="roles" />
        </div>

        {/* D-168: which modules this person may use, sent only when they can be
            changed. A Super Admin uses every module, so boxes would only mislead. */}
        {values.roles.includes("SUPER_ADMIN") ? (
          <div className="sm:col-span-2" data-testid="module-access">
            <p className="field-label">Module access</p>
            <p className="rounded-md border border-line p-3 text-label text-ink-muted">
              Every module: {MODULES.map((module) => MODULE_LABEL[module]).join(", ")}. The Super Admin isn&apos;t limited by module access.
            </p>
          </div>
        ) : (
          <fieldset className="sm:col-span-2" data-testid="module-access" disabled={Boolean(moduleLock)}>
            <legend className="field-label">
              Module access <Hint text="Each module is separate: AI doesn't include the others. The Super Admin can use every module." align="start" />
            </legend>
            {!moduleLock && <input type="hidden" name="modulesShown" value="1" />}
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULES.map((module) => (
                <div key={module} className="relative">
                  <label className={`flex gap-3 rounded-md border border-line p-3 pr-9 ${moduleLock ? "opacity-70" : "cursor-pointer"}`}>
                    <input type="checkbox" name="modules" value={module} defaultChecked={values.modules.includes(module)} className="mt-1" />
                    <span className="font-medium">{MODULE_LABEL[module]}</span>
                  </label>
                  <CardHint text={MODULE_HELP[module]} />
                </div>
              ))}
            </div>
            {moduleLock && <p className="mt-1.5 text-caption text-ink-muted">{moduleLock}</p>}
            <FieldError result={result} name="modules" />
          </fieldset>
        )}

        {/* D-172: Pico Bot chat access. Only takes effect with the AI module, and
            only for modes the Super Admin has switched on (AI settings).
            D-176: the Super Admin has every chat and all Salesforce records. */}
        {values.roles.includes("SUPER_ADMIN") ? (
          <div className="sm:col-span-2" data-testid="chat-access">
            <p className="field-label">Pico Bot: what this person may ask about</p>
            <p className="rounded-md border border-line p-3 text-label text-ink-muted">
              Every chat: {CHAT_MODES.map((chatMode) => MODE_LABEL[chatMode]).join(", ")}, with all Salesforce records. The Super Admin isn&apos;t limited here; only the emergency stop applies.
            </p>
          </div>
        ) : (
        <fieldset className="sm:col-span-2" data-testid="chat-access" disabled={Boolean(moduleLock)}>
          <legend className="field-label">
            Pico Bot: what this person may ask about{" "}
            <Hint text="Needs the AI module above. A module chat also needs that module. General, Salesforce and Combined chat must also be switched on in AI settings." align="start" />
          </legend>
          {!moduleLock && <input type="hidden" name="chatShown" value="1" />}
          <div className="grid gap-2 sm:grid-cols-2">
            {CHAT_MODES.map((chatMode) => (
              <div key={chatMode} className="relative">
                <label className={`flex gap-3 rounded-md border border-line p-3 pr-9 ${moduleLock ? "opacity-70" : "cursor-pointer"}`}>
                  <input type="checkbox" name="chatModes" value={chatMode} defaultChecked={values.chatModes.includes(chatMode)} className="mt-1" />
                  <span className="font-medium">{MODE_LABEL[chatMode]}</span>
                </label>
                <CardHint text={MODE_HELP[chatMode]} />
              </div>
            ))}
          </div>
          <label htmlFor="salesforceScope" className="field-label mt-3">
            Salesforce records Pico Bot may read for this person
          </label>
          <select id="salesforceScope" name="salesforceScope" defaultValue={values.salesforceScope} className="field-input sm:w-96">
            <option value="NONE">None</option>
            <option value="OWN">Records they own in Salesforce (matched by email)</option>
            <option value="ALL">All records of the allowed objects</option>
          </select>
          {moduleLock && <p className="mt-1.5 text-caption text-ink-muted">{moduleLock}</p>}
          <FieldError result={result} name="chatModes" />
          <FieldError result={result} name="salesforceScope" />
        </fieldset>
        )}
      </fieldset>
      {mode === "create" && (
        <div className="flex items-center gap-1.5 border-t border-line px-5 py-4">
          <label className="flex items-center gap-2 text-label">
            <input type="checkbox" name="invite" defaultChecked />
            <span className="font-medium">Email an invitation now</span>
          </label>
          <Hint
            text={method === "GOOGLE" ? "Tells them they've been added and to sign in with Google as this email." : method === "BOTH" ? "Sends their User ID and a link to set their password (confirmed by a WhatsApp code); they can also sign in with Google as this email." : "Sends their User ID and a link to set their password (confirmed by a WhatsApp code)."}
            align="start"
          />
        </div>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
          <SubmitButton pending={pending} className="btn-compact">{mode === "create" ? "Create user" : "Save changes"}</SubmitButton>
          <div className="min-w-0 flex-1">
            <ResultMessage result={result} />
            <FieldError result={result} name="form" />
          </div>
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  result,
  hint,
  type = "text",
  autoComplete,
}: {
  label: string;
  name: string;
  defaultValue: string;
  result: Parameters<typeof FieldError>[0]["result"];
  hint?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1">
        <label htmlFor={name} className="field-label">
          {label}
        </label>
        <Hint text={hint} align="start" className="mb-1.5" />
      </div>
      <input id={name} name={name} type={type} defaultValue={defaultValue} autoComplete={autoComplete} className="field-input" />
      <FieldError result={result} name={name} />
    </div>
  );
}

// D-179: an option card's explanation, as a hover hint in its top corner
// (outside the label, so hovering or clicking it never ticks the box).
function CardHint({ text }: { text: string }) {
  return (
    <span className="absolute right-2 top-3">
      <Hint text={text} align="end" />
    </span>
  );
}

function Select({
  label,
  name,
  options,
  defaultValue,
  result,
  emptyLabel = "Not set",
}: {
  label: string;
  name: string;
  options: Option[];
  defaultValue: number | null;
  result: Parameters<typeof FieldError>[0]["result"];
  emptyLabel?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      <select id={name} name={name} defaultValue={defaultValue ?? ""} className="field-input">
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError result={result} name={name} />
    </div>
  );
}
