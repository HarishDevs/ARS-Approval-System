"use client";

import { ErrorState } from "@/features/ui/States";

// FB-02: a page that fails inside this space keeps the menu around it.
// Nothing technical is shown; the reference matches the server log.
export default function SpaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      variant="page"
      title="This page couldn't be shown"
      body="It may be a connection problem. Try again; if it keeps happening, copy the details for IT."
      onRetry={reset}
      digest={error.digest}
      homeHref="/users"
    />
  );
}
