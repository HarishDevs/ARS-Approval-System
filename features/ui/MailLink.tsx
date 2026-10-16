"use client";

import { useEffect, useState } from "react";
import { Email } from "@/features/ui/SafeText";

// WEB-19 (v1.10.0): a clickable email address. The mailto: link is added
// after the page loads, so the HTML has no address for Cloudflare's email
// obfuscation to rewrite (see SafeText). Only a plain, valid address is
// ever linked; anything else shows as text.
const VALID = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function mailtoHref(address: string): string | null {
  const clean = address.trim();
  return VALID.test(clean) ? `mailto:${clean}` : null;
}

export function MailLink({ address }: { address: string }) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => setHref(mailtoHref(address)), [address]);
  if (!href) return <Email address={address} />;
  return (
    <a href={href} className="text-primary-700 underline-offset-2 hover:underline">
      <Email address={address} />
    </a>
  );
}
