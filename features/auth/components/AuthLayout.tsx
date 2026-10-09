import { Email } from "@/features/ui/SafeText";

// Split layout for sign-in, set-password and forgot-password (asset pack
// 00-login-split-layout-alt).
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-full lg:grid-cols-2">
      <section
        aria-hidden="true"
        className="relative hidden overflow-hidden bg-gradient-to-br from-primary-solid to-[#003B6E] px-16 py-14 text-white lg:flex lg:flex-col lg:justify-end"
      >
        <div className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full border-[56px] border-white/10" />
        <div className="pointer-events-none absolute -bottom-52 -left-24 h-[420px] w-[420px] rounded-full border-[48px] border-white/10" />
        <div className="relative max-w-lg">
          <svg viewBox="0 0 120 30" className="mb-6 h-8 w-auto" aria-hidden="true">
            <path d="M0 12 C30 30 80 28 118 0 C104 22 92 30 64 30 C36 30 14 22 0 12Z" fill="#ED1C25" />
          </svg>
          <p className="text-label font-semibold uppercase tracking-[0.18em] text-white/80">ARS Steels · Approvals</p>
          <h2 className="mt-4 text-[52px] font-bold leading-[1.05]">
            Every approval,
            <br />
            one clear path.
          </h2>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/85">
            Raise a request, route it through as many levels as it needs, and see exactly who has approved and who is next.
          </p>
          <dl className="mt-12 grid grid-cols-3 gap-6">
            <div>
              <dt className="text-card-title font-bold">Any</dt>
              <dd className="text-label text-white/75">number of levels</dd>
            </div>
            <div>
              <dt className="text-card-title font-bold">One</dt>
              <dd className="text-label text-white/75">place for every request</dd>
            </div>
            <div>
              <dt className="text-card-title font-bold">Full</dt>
              <dd className="text-label text-white/75">history, always</dd>
            </div>
          </dl>
          <p className="mt-16 text-caption text-white/60">© 2026 ARS Steels &amp; Alloy International Pvt. Ltd.</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-[440px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
          <img src="/brand/ars-green-steel.svg" alt="ARS Green Steel" className="h-16 w-auto" />
          {children}
          <p className="mt-8 text-center text-body text-ink-muted">
            Need access? Contact IT Support: <span className="select-all font-medium text-ink"><Email address="itadmin@arssteels.co.in" /></span>
          </p>
        </div>
      </section>
    </main>
  );
}
