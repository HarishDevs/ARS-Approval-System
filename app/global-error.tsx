"use client";

// Last resort when even the root layout fails (QA session 14). Plain markup:
// the app's styles may not be available here.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, background: "#f8fafc", color: "#0f172a" }}>
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>ARS-CMS couldn&apos;t load</h1>
          <p style={{ color: "#475569" }}>Check your connection and try again. If it keeps happening, contact IT.</p>
          <button type="button" onClick={reset} style={{ background: "#005398", color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
