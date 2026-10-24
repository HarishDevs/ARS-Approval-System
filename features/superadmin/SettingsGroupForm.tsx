"use client";

import { useState } from "react";
import { saveSettingsAction } from "@/app/superadmin/settings/actions";
import { Switch } from "@/features/ui/Field";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { DisplaySetting } from "@/server/settings/resolve";
import { Hint } from "@/features/ui/Hint";
import { splitLabel } from "@/features/superadmin/split-label";

// Plain names for the stored choice values of dropdown settings.
const OPTION_LABEL: Record<string, string> = {
  ON: "On",
  OFF: "Off",
  IT_ONLY: "IT team only",
  ALLOWED: "Allowed",
  NOT_ALLOWED: "Not allowed",
  NONE: "None",
  CLAUDE: "Claude (Anthropic)",
  OPENAI: "ChatGPT (OpenAI)",
  GROK: "Grok (xAI)",
  DEEPSEEK: "DeepSeek",
  GROQ: "Groq",
  GEMINI: "Gemini (Google AI Studio)",
  NVIDIA: "NVIDIA (Nemotron)",
  SANDBOX: "Sandbox",
  PRODUCTION: "Production",
  EVERYONE: "Everyone",
  ROLE: "By role",
  WARN: "Warn",
  BLOCK: "Block",
  APPROVAL: "Approvals",
  TASK: "Tasks",
  INFORMATION: "Information",
  SALESFORCE: "Salesforce",
};

const isOnOff = (setting: DisplaySetting) => setting.options?.length === 2 && setting.options.includes("ON") && setting.options.includes("OFF");

// D-183 (owner: "use dropdown or checkbox wherever possible"): ON/OFF is a
// switch; a list of several choices is a set of checkboxes. Both send the
// same stored text as before through a hidden field.
function OnOffSetting({ setting, name }: { setting: DisplaySetting; name: string }) {
  const [on, setOn] = useState((setting.value ?? "OFF") === "ON");
  return (
    <>
      <input type="hidden" name={setting.key} value={on ? "ON" : "OFF"} />
      <Switch label={name} checked={on} onChange={setOn} />
    </>
  );
}

function ChoicesSetting({ setting, name, hint }: { setting: DisplaySetting; name: string; hint: string | null }) {
  const [chosen, setChosen] = useState(() => new Set((setting.value ?? "").split(",").filter(Boolean)));
  const choices = setting.choices ?? [];
  return (
    <fieldset>
      <legend className="field-label inline-flex items-center gap-1">
        {name}
        <Hint text={hint} align="start" />
      </legend>
      <input type="hidden" name={setting.key} value={choices.filter((choice) => chosen.has(choice)).join(",")} />
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {choices.map((choice) => (
          <label key={choice} className="inline-flex items-center gap-2 text-label">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-primary-solid)]"
              checked={chosen.has(choice)}
              onChange={(event) =>
                setChosen((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(choice);
                  else next.delete(choice);
                  return next;
                })
              }
            />
            {OPTION_LABEL[choice] ?? choice}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// One settings group (F-52). Secrets never reach the browser: the field
// starts empty, shows only Configured / Not configured, and a blank value
// keeps the stored key.
export function SettingsGroupForm({ group, title, description, settings, actions, testId }: { group: string; title: string; description: string; settings: DisplaySetting[]; actions?: React.ReactNode; testId?: string }) {
  // Cleared after a save so a typed key never lingers in the field.
  const { result, pending, formRef, onSubmit } = useActionForm(saveSettingsAction, { resetOnSuccess: true });

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card" data-testid={testId}>
      <input type="hidden" name="group" value={group} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-1.5 font-semibold">
          {title}
          <Hint text={description} align="start" />
        </h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
        {settings.map((setting) => {
          const { name, hint } = splitLabel(setting.label);
          // Keyed by the saved value, so the form reset after a save shows it.
          if (isOnOff(setting))
            return (
              <div key={`${setting.key}:${setting.value ?? ""}`} className="flex items-center gap-1 self-end py-2">
                <OnOffSetting setting={setting} name={name} />
                <Hint text={hint} align="start" />
              </div>
            );
          if (setting.choices)
            return (
              <div key={`${setting.key}:${setting.value ?? ""}`} className="sm:col-span-2">
                <ChoicesSetting setting={setting} name={name} hint={hint} />
                <FieldError result={result} name={setting.key} />
              </div>
            );
          return (
          <div key={setting.key} className={setting.encrypted ? "sm:col-span-2" : undefined}>
            <label htmlFor={setting.key} className="field-label flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1">
                {name}
                <Hint text={hint} align="start" />
              </span>
              {setting.encrypted && (
                <span className={`badge ${setting.status === "CONFIGURED" ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
                  {setting.status === "CONFIGURED" ? "Configured" : "Not configured"}
                </span>
              )}
            </label>
            {setting.encrypted ? (
              <>
                <input
                  id={setting.key}
                  name={setting.key}
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={setting.status === "CONFIGURED" ? "Leave blank to keep the current key" : "Paste the key"}
                  className="field-input"
                />
                {setting.status === "CONFIGURED" && (
                  <label className="mt-2 flex items-center gap-2 text-label text-ink-muted">
                    <input type="checkbox" name={`${setting.key}__clear`} className="h-4 w-4" /> Remove this key
                  </label>
                )}
              </>
            ) : setting.options ? (
              // Keyed by the saved value: the form reset after a save would
              // otherwise put the dropdown back on the previous choice.
              <select key={`${setting.key}:${setting.value ?? ""}`} id={setting.key} name={setting.key} defaultValue={setting.value ?? setting.options[0]} className="field-input">
                {setting.options.map((option) => (
                  <option key={option} value={option}>
                    {OPTION_LABEL[option] ?? option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={setting.key}
                name={setting.key}
                type={setting.valueType === "NUMBER" ? "number" : "text"}
                defaultValue={setting.value ?? ""}
                className="field-input"
              />
            )}
            <FieldError result={result} name={setting.key} />
          </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <SubmitButton pending={pending} className="btn-compact">Save</SubmitButton>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
    </form>
  );
}
