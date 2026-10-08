"use client";

import { useState } from "react";
import { createUserAction, updateUserAction } from "@/app/admin/users/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { RoleCode, SignInMethod } from "@/types/auth";

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
}

const ROLE_INFO: { role: RoleCode; label: string; body: string }[] = [
  { role: "USER", label: "User", body: "Raise requests, create custom approvals, approve what is assigned. Everyone has this." },
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
}: {
  mode: "create" | "edit";
  values: UserFormValues;
  departments: Option[];
  designations: Option[];
  managers: Option[];
  canGrantSuperAdmin: boolean;
  readOnly: boolean;
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
          hint={method === "PASSWORD" ? "Required: sign-in codes go here. 10-digit Indian numbers get +91." : "Used for notifications. 10-digit Indian numbers get +91."}
        />

        <div className="sm:col-span-2">
          <p className="field-label">How they sign in</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["GOOGLE", "PASSWORD"] as const).map((option) => (
              <label key={option} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${method === option ? "border-primary-600 bg-primary-50" : "border-line"}`}>
                <input type="radio" name="signInMethod" value={option} checked={method === option} onChange={() => setMethod(option)} className="mt-1" />
                <span>
                  <span className="block font-medium">{option === "GOOGLE" ? "Google account" : "User ID + password"}</span>
                  <span className="block text-label text-ink-muted">{option === "GOOGLE" ? "No code needed." : "Then a code on WhatsApp every time."}</span>
                </span>
              </label>
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
                <label key={role} className={`flex gap-3 rounded-md border border-line p-3 ${locked ? "opacity-70" : "cursor-pointer"}`}>
                  <input type="checkbox" name="roles" value={role} defaultChecked={values.roles.includes(role)} disabled={locked} className="mt-1" />
                  {/* A disabled checkbox isn't submitted, so keep its value. */}
                  {locked && values.roles.includes(role) && <input type="hidden" name="roles" value={role} />}
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-label text-ink-muted">{body}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <FieldError result={result} name="roles" />
        </div>
      </fieldset>
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
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      <input id={name} name={name} type={type} defaultValue={defaultValue} autoComplete={autoComplete} className="field-input" />
      {hint && <p className="mt-1 text-caption text-ink-muted">{hint}</p>}
      <FieldError result={result} name={name} />
    </div>
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
