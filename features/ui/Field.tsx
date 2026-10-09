"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef } from "react";

// Form controls (UI-03). Field wires label, hint and error to the control
// (aria-describedby, aria-invalid) so screen readers read them together.
export interface FieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  optional?: boolean;
  children: (control: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => React.ReactNode;
  className?: string;
  id?: string;
}

export function Field({ label, hint, error, optional, children, className = "", id: given }: FieldProps) {
  const auto = useId();
  const id = given ?? `f${auto.replace(/:/g, "")}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {optional && <span className="font-normal text-ink-faint"> (optional)</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && (
        <p id={hintId} className="mt-1 text-caption text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-caption text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field-input ${props["aria-invalid"] ? "field-invalid" : ""} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`field-input h-auto py-2.5 ${props["aria-invalid"] ? "field-invalid" : ""} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`field-input ${props["aria-invalid"] ? "field-invalid" : ""} ${props.className ?? ""}`} />;
}

export function SearchInput({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <input type="search" aria-label={label} {...props} className={`field-input pl-9 ${props.className ?? ""}`} />
    </div>
  );
}

export function Checkbox({ label, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; hint?: React.ReactNode }) {
  const auto = useId();
  const id = props.id ?? `c${auto.replace(/:/g, "")}`;
  return (
    <div className="flex items-start gap-2.5">
      <input type="checkbox" id={id} {...props} className={`mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary-solid)] ${props.className ?? ""}`} />
      <label htmlFor={id} className="text-label">
        <span className="font-medium text-ink">{label}</span>
        {hint && <span className="block text-caption text-ink-muted">{hint}</span>}
      </label>
    </div>
  );
}

// An on/off switch: a real checkbox with role="switch" (keyboard: Space).
export function Switch({ label, checked, onChange, disabled, name, defaultChecked }: { label: string; checked?: boolean; onChange?: (value: boolean) => void; disabled?: boolean; name?: string; defaultChecked?: boolean }) {
  const auto = useId();
  const id = `s${auto.replace(/:/g, "")}`;
  return (
    <label htmlFor={id} className={`inline-flex cursor-pointer items-center gap-3 text-label ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        name={name}
        className="peer sr-only"
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-line-strong transition-colors duration-fast peer-checked:bg-primary-solid peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-surface after:shadow after:transition-transform after:duration-fast peer-checked:after:translate-x-5" />
      <span>{label}</span>
    </label>
  );
}

export function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  defaultValue,
  onChange,
  hint,
}: {
  legend: string;
  name: string;
  options: readonly { value: T; label: string; hint?: string; icon?: React.ReactNode }[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  hint?: string;
}) {
  return (
    <fieldset>
      <legend className="field-label">{legend}</legend>
      {hint && <p className="-mt-1 mb-2 text-caption text-ink-muted">{hint}</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line bg-surface px-3 py-2.5 text-label has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === undefined ? undefined : value === option.value}
              defaultChecked={defaultValue === undefined ? undefined : defaultValue === option.value}
              onChange={() => onChange?.(option.value)}
              className="mt-0.5 h-4 w-4 accent-[var(--color-primary-solid)]"
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium text-ink">
                {option.icon}
                {option.label}
              </span>
              {option.hint && <span className="block text-caption text-ink-muted">{option.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// FB-06: a summary of what to fix, at the top of the form. Each line links
// to its field; the summary takes focus when it appears.
export function ErrorSummary({ errors, labels = {} }: { errors: Record<string, string> | undefined; labels?: Record<string, string> }) {
  const entries = Object.entries(errors ?? {});
  const box = useRef<HTMLDivElement>(null);
  const signature = entries.map(([name, message]) => `${name}:${message}`).join("|");
  // Focus moves here once per new set of errors, never while typing.
  useEffect(() => {
    if (signature) box.current?.focus();
  }, [signature]);
  if (entries.length === 0) return null;
  return (
    <div
      role="alert"
      tabIndex={-1}
      ref={box}
      aria-labelledby="error-summary-title"
      className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-label text-danger-600 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
    >
      <p id="error-summary-title" className="font-semibold">
        {entries.length === 1 ? "Please fix 1 thing:" : `Please fix ${entries.length} things:`}
      </p>
      <ul className="mt-1 list-disc pl-5">
        {entries.map(([name, message]) => (
          <li key={name}>
            <a
              href={`#${name}`}
              className="underline"
              onClick={(event) => {
                const target = document.getElementById(name) ?? document.getElementsByName(name)[0];
                if (target instanceof HTMLElement) {
                  event.preventDefault();
                  target.focus();
                  target.scrollIntoView({ block: "center", behavior: "smooth" });
                }
              }}
            >
              {labels[name] ? `${labels[name]}: ` : ""}
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
