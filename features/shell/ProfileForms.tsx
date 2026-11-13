"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { aboutMeAction, removePhotoAction, uploadPhotoAction } from "@/app/users/profile-actions";
import { Avatar } from "@/features/ui/Avatar";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { PHOTO_ACCEPT } from "@/server/profile/photo";
import { RichEditor } from "@/features/ui/RichEditor";

// D-230: change or remove your photo (Asana's "Upload new photo • Remove photo").
export function PhotoForm({ name, src, approver }: { name: string; src: string | null; approver: boolean }) {
  const { result, pending, formRef, onSubmit } = useActionForm(uploadPhotoAction);
  const [preview, setPreview] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex w-full shrink-0 flex-col items-center gap-2 text-center sm:w-48" data-testid="photo-form">
      <Avatar name={name} src={preview ?? src} size="xl" approver={approver} />
      <label htmlFor="profile-photo" className="sr-only">
        Your photo
      </label>
      <input
        ref={input}
        id="profile-photo"
        name="photo"
        type="file"
        accept={PHOTO_ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          setPreview(file ? URL.createObjectURL(file) : null);
          if (file) formRef.current?.requestSubmit();
        }}
      />
      <span className="flex flex-wrap items-center justify-center gap-x-2 text-label">
        <button type="button" className="link inline-flex items-center gap-1" onClick={() => input.current?.click()} disabled={pending}>
          <Camera aria-hidden="true" className="h-3.5 w-3.5" /> {src || preview ? "Upload new photo" : "Upload a photo"}
        </button>
        {src && !preview && (
          <>
            <span aria-hidden="true" className="text-ink-faint">
              •
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-semibold text-danger-600 hover:underline"
              disabled={removing}
              onClick={async () => {
                setRemoving(true);
                const done = await removePhotoAction();
                setRemoving(false);
                setRemoved(done.message ?? null);
                if (done.ok) window.location.reload();
              }}
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" /> Remove photo
            </button>
          </>
        )}
      </span>
      <span className="text-caption text-ink-muted">JPEG, PNG or WebP, up to 3 MB. Photos help people recognise you.</span>
      {pending && <span className="text-caption text-ink-muted">Saving…</span>}
      <ResultMessage result={result} />
      {removed && <p className="text-caption text-ink-muted">{removed}</p>}
    </form>
  );
}

export function AboutForm({ initial }: { initial: string | null }) {
  const { result, pending, formRef, onSubmit } = useActionForm(aboutMeAction);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
      <label htmlFor="about-me" className="field-label">
        About me
      </label>
      <RichEditor id="about-me" name="about" label="About me" initialText={initial ?? ""} maxLength={1000} minHeight={90} placeholder="What you do, what to ask you about." />
      <div className="flex items-center gap-3">
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Save
        </SubmitButton>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}
