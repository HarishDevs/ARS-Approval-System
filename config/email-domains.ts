// v1.54.7 (owner): Google Workspace moved everyone from arsenergy.co.in to
// arssteels.co.in; each old address is still an alias of the same Google
// account. An ARS CMS account registered with the old address is the same
// person as the Google account now reporting the new one.
//
// This only helps FIND an account IT already created (and only one that was
// never linked to Google). It never creates an account or grants access by
// domain: the account must exist, be active and allow Google sign-in.
export const EMAIL_DOMAIN_MOVES: readonly { from: string; to: string }[] = [{ from: "arsenergy.co.in", to: "arssteels.co.in" }];

const split = (email: string) => {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  return at > 0 ? { local: value.slice(0, at), domain: value.slice(at + 1) } : null;
};

// The same mailbox's address on the other side of each move (both ways).
export function movedEmails(email: string): string[] {
  const parts = split(email);
  if (!parts) return [];
  const out: string[] = [];
  for (const move of EMAIL_DOMAIN_MOVES) {
    if (parts.domain === move.to) out.push(`${parts.local}@${move.from}`);
    if (parts.domain === move.from) out.push(`${parts.local}@${move.to}`);
  }
  return out;
}

// An address on a domain people moved away from (never move an account's
// email back onto it, even if a stale Google profile still reports it).
export function isRetiredDomain(email: string): boolean {
  const parts = split(email);
  return Boolean(parts && EMAIL_DOMAIN_MOVES.some((move) => move.from === parts.domain));
}
