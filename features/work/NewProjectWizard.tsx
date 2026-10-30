"use client";

import { ArrowLeft, CalendarDays, Columns3, GanttChart, LayoutTemplate, List, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { createProjectAction, fromTemplateAction } from "@/app/users/work/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { COLOR_HEX } from "@/features/work/client";
import { PRIVACY, PRIVACY_LABEL, PROJECT_COLORS } from "@/server/work/access";

// D-220 (owner: "create project like Asana, page by page"): 1. how to start
// (blank or a template), 2. name, department, who can see it and the default
// view (with a small preview), 3. the sections to start with; then Create.
// A template asks for the name, start date and who can see it.
type Step = "start" | "details" | "sections" | "template";
const VIEW_CARDS = [
  { key: "LIST", label: "List", icon: List, hint: "Rows in sections, with columns" },
  { key: "BOARD", label: "Board", icon: Columns3, hint: "Cards in columns" },
  { key: "TIMELINE", label: "Timeline", icon: GanttChart, hint: "Bars from start to due" },
  { key: "CALENDAR", label: "Calendar", icon: CalendarDays, hint: "Tasks on their due dates" },
] as const;

export function NewProjectWizard({ templates, departments, myDepartmentId, startTemplate }: { templates: { id: number; name: string; tasks: number; sections: string[] }[]; departments: { id: number; name: string }[]; myDepartmentId: number | null; startTemplate: number | null }) {
  const [step, setStep] = useState<Step>(startTemplate ? "template" : "start");
  const [template, setTemplate] = useState<number | null>(startTemplate);
  const [name, setName] = useState("");
  const [privacy, setPrivacy] = useState("PRIVATE");
  const [department, setDepartment] = useState<number | "">(myDepartmentId ?? "");
  const [view, setView] = useState("LIST");
  const [color, setColor] = useState("green");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState(["To do", "In progress", "Done"]);
  const create = useActionForm(createProjectAction);
  const fromTemplate = useActionForm(fromTemplateAction);
  const card = (on: boolean) => `rounded-xl border p-4 text-left transition ${on ? "border-primary-600 bg-primary-50 ring-1 ring-primary-600" : "border-line bg-surface hover:border-line-strong"}`;
  const chosen = templates.find((item) => item.id === template);

  return (
    <div className="mx-auto min-w-0 max-w-4xl [overflow-wrap:anywhere]" data-testid="new-project">
      <Link href="/users/work/projects" className="mb-4 inline-flex items-center gap-1 text-label text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Projects
      </Link>
      <ol className="mb-6 flex gap-2 text-caption text-ink-muted" aria-label="Steps">
        {(step === "template" ? ["Start", "Template details"] : ["Start", "Project details", "Sections"]).map((label, index) => {
          const current = step === "start" ? 0 : step === "details" || step === "template" ? 1 : 2;
          return (
            <li key={label} aria-current={index === current ? "step" : undefined} className={`flex items-center gap-1 ${index === current ? "font-semibold text-primary-700" : ""}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[length:calc(10px*var(--text-scale,1))] ${index <= current ? "bg-primary-solid text-white" : "bg-surface-muted"}`}>{index + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>

      {step === "start" && (
        <section aria-labelledby="start-title">
          <h1 id="start-title" className="mb-6 text-center text-display font-semibold tracking-tight">
            Create a new project
          </h1>
          <div className="grid gap-4 sm:grid-cols-2">
            <button type="button" className={`${card(false)} flex flex-col items-center gap-3 py-10`} onClick={() => setStep("details")}>
              <span className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed border-line-strong">
                <Plus aria-hidden="true" className="h-7 w-7 text-ink-muted" />
              </span>
              <span className="font-semibold">Blank project</span>
              <span className="text-caption text-ink-muted">Start from scratch</span>
            </button>
            <button type="button" className={`${card(false)} flex flex-col items-center gap-3 py-10`} onClick={() => setStep("template")} disabled={!templates.length}>
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-50">
                <LayoutTemplate aria-hidden="true" className="h-7 w-7 text-primary-700" />
              </span>
              <span className="font-semibold">Use a template</span>
              <span className="text-caption text-ink-muted">{templates.length ? `${templates.length} template${templates.length === 1 ? "" : "s"} saved` : "Save a project as a template first"}</span>
            </button>
          </div>
        </section>
      )}

      {step === "details" && (
        <section aria-labelledby="details-title" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <h1 id="details-title" className="text-title font-semibold">
              New project
            </h1>
            <div>
              <label htmlFor="wizard-name" className="field-label">
                Project name
              </label>
              <input id="wizard-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={150} className="field-input" />
            </div>
            <div>
              <label htmlFor="wizard-department" className="field-label">
                Department (team)
              </label>
              <select id="wizard-department" value={department} onChange={(event) => setDepartment(event.target.value ? Number(event.target.value) : "")} className="field-input">
                <option value="">None</option>
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className="field-label">Privacy</legend>
              <div className="grid gap-2">
                {PRIVACY.map((item) => (
                  <label key={item} className={`${card(privacy === item)} flex items-center gap-3 py-2.5`}>
                    <input type="radio" name="wizard-privacy" checked={privacy === item} onChange={() => setPrivacy(item)} />
                    <span>
                      <span className="block font-medium">{PRIVACY_LABEL[item]}</span>
                      <span className="text-caption text-ink-muted">{item === "PRIVATE" ? "Only the people and departments you add" : item === "DEPARTMENT" ? "Everyone in the department above" : "Every active person at ARS"}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="field-label">Default view</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {VIEW_CARDS.map((item) => (
                  <label key={item.key} className={`${card(view === item.key)} flex cursor-pointer flex-col items-center gap-1 py-3 text-center`}>
                    <input type="radio" name="wizard-view" className="sr-only" checked={view === item.key} onChange={() => setView(item.key)} />
                    <item.icon aria-hidden="true" className="h-6 w-6" />
                    <span className="text-label font-medium">{item.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="field-label">Colour</legend>
              <div className="flex flex-wrap gap-2">
                {PROJECT_COLORS.map((item) => (
                  <label key={item} className="cursor-pointer">
                    <input type="radio" name="wizard-color" className="peer sr-only" checked={color === item} onChange={() => setColor(item)} />
                    <span aria-label={item} className="block h-7 w-7 rounded-md ring-offset-2 peer-checked:ring-2 peer-checked:ring-primary-600 peer-focus-visible:ring-2" style={{ backgroundColor: COLOR_HEX[item] }} />
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="wizard-description" className="field-label">
                What it is for <span className="font-normal text-ink-faint">(optional)</span>
              </label>
              <textarea id="wizard-description" rows={3} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} className="field-input h-auto py-2" />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary w-auto" onClick={() => setStep("start")}>
                Back
              </button>
              <button type="button" className="btn-primary" disabled={name.trim().length < 2 || (privacy === "DEPARTMENT" && department === "")} onClick={() => setStep("sections")}>
                Continue
              </button>
            </div>
            {privacy === "DEPARTMENT" && department === "" && <p className="text-caption text-warning-600">Choose the department that shares this project.</p>}
          </div>
          <Preview name={name} color={color} view={view} sections={sections} />
        </section>
      )}

      {step === "sections" && (
        <form onSubmit={create.onSubmit} aria-labelledby="sections-title" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <h1 id="sections-title" className="text-title font-semibold">
              Add sections to get started
            </h1>
            <p className="text-label text-ink-muted">Sections group your tasks (stages, weeks, teams…). You can change them any time.</p>
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="privacy" value={privacy} />
            <input type="hidden" name="department" value={department} />
            <input type="hidden" name="default_view" value={view} />
            <input type="hidden" name="color" value={color} />
            <input type="hidden" name="description" value={description} />
            <input type="hidden" name="default_access_role" value="COMMENTER" />
            <input type="hidden" name="sections" value={sections.map((item) => item.trim()).filter(Boolean).join("\n")} />
            <ul className="space-y-2">
              {sections.map((section, index) => (
                <li key={index} className="flex gap-2">
                  <label className="sr-only" htmlFor={`section-${index}`}>
                    Section {index + 1}
                  </label>
                  <input id={`section-${index}`} value={section} maxLength={150} onChange={(event) => setSections((value) => value.map((item, at) => (at === index ? event.target.value : item)))} className="field-input" />
                  <button type="button" aria-label={`Remove section ${index + 1}`} disabled={sections.length <= 1} onClick={() => setSections((value) => value.filter((_, at) => at !== index))} className="btn-ghost btn-compact">
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-secondary btn-compact inline-flex items-center gap-1" onClick={() => setSections((value) => [...value, ""])} disabled={sections.length >= 20}>
              <Plus aria-hidden="true" className="h-4 w-4" /> Add section
            </button>
            <ResultMessage result={create.result} />
            <div className="flex gap-2">
              <button type="button" className="btn-secondary w-auto" onClick={() => setStep("details")}>
                Back
              </button>
              <SubmitButton pending={create.pending} className="w-auto">Create project</SubmitButton>
            </div>
          </div>
          <Preview name={name} color={color} view={view} sections={sections} />
        </form>
      )}

      {step === "template" && (
        <form onSubmit={fromTemplate.onSubmit} aria-labelledby="template-title" className="space-y-4">
          <h1 id="template-title" className="text-title font-semibold">
            Use a template
          </h1>
          <fieldset>
            <legend className="field-label">Template</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((item) => (
                <label key={item.id} className={`${card(template === item.id)} min-w-0 cursor-pointer [overflow-wrap:anywhere]`}>
                  <input type="radio" name="templateId" value={item.id} className="sr-only" checked={template === item.id} onChange={() => setTemplate(item.id)} />
                  <span className="mb-1 flex min-w-0 items-start gap-2 font-semibold">
                    <LayoutTemplate aria-hidden="true" className="h-4 w-4 text-primary-700" /> {item.name}
                  </span>
                  <span className="block text-caption text-ink-muted">
                    {item.tasks} task{item.tasks === 1 ? "" : "s"} · {item.sections.slice(0, 3).join(", ")}
                    {item.sections.length > 3 ? "…" : ""}
                  </span>
                </label>
              ))}
            </div>
            <FieldError result={fromTemplate.result} name="templateId" />
          </fieldset>
          {chosen && (
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="template-project-name" className="field-label">
                  Project name
                </label>
                <input id="template-project-name" name="name" required minLength={2} maxLength={150} defaultValue={chosen.name.replace(/\s*\(template\)\s*$/i, "")} className="field-input" />
              </div>
              <div>
                <label htmlFor="template-start" className="field-label">
                  Starts on <span className="font-normal text-ink-faint">(task dates move with it)</span>
                </label>
                <input id="template-start" type="date" name="start_on" className="field-input" />
              </div>
              <div>
                <label htmlFor="template-privacy" className="field-label">
                  Privacy
                </label>
                <select id="template-privacy" name="privacy" defaultValue="PRIVATE" className="field-input">
                  {PRIVACY.map((item) => (
                    <option key={item} value={item}>
                      {PRIVACY_LABEL[item]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="template-department" className="field-label">
                  Department (team)
                </label>
                <select id="template-department" name="department" defaultValue={myDepartmentId ?? ""} className="field-input">
                  <option value="">As in the template</option>
                  {departments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <ResultMessage result={fromTemplate.result} />
          <div className="flex gap-2">
            <button type="button" className="btn-secondary w-auto" onClick={() => setStep("start")}>
              Back
            </button>
            <SubmitButton pending={fromTemplate.pending} className="w-auto">Create from template</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}

// A small picture of the project as it will open.
function Preview({ name, color, view, sections }: { name: string; color: string; view: string; sections: string[] }) {
  const named = sections.map((item) => item.trim()).filter(Boolean);
  return (
    <aside aria-label="Preview" className="hidden h-fit rounded-xl border border-line bg-surface-muted p-4 lg:block">
      <p className="mb-3 flex items-center gap-2 font-semibold">
        <span aria-hidden="true" className="h-5 w-5 rounded" style={{ backgroundColor: COLOR_HEX[color] }} />
        <span className="truncate">{name || "Project name"}</span>
      </p>
      {view === "BOARD" ? (
        <div className="flex gap-2">
          {named.slice(0, 3).map((section) => (
            <div key={section} className="flex-1 rounded-lg bg-surface p-2">
              <p className="mb-2 truncate text-caption font-semibold">{section}</p>
              <div className="mb-1 h-6 rounded border border-line bg-surface" />
              <div className="h-6 rounded border border-line bg-surface" />
            </div>
          ))}
        </div>
      ) : view === "CALENDAR" ? (
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 21 }, (_, index) => (
            <div key={index} className={`h-6 rounded ${index % 5 === 2 ? "bg-primary-100" : "bg-surface"}`} />
          ))}
        </div>
      ) : view === "TIMELINE" ? (
        <div className="space-y-2">
          {[40, 60, 30, 70].map((width, index) => (
            <div key={index} className="h-4 rounded bg-primary-solid/70" style={{ width: `${width}%`, marginLeft: `${index * 8}%` }} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {named.slice(0, 3).map((section) => (
            <div key={section}>
              <p className="mb-1 truncate text-caption font-semibold">{section}</p>
              <div className="mb-1 h-5 rounded bg-surface" />
              <div className="h-5 rounded bg-surface" />
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
