// Email addresses on pages (S8-11). GoDaddy serves the app through
// Cloudflare, whose "email obfuscation" rewrites any address in the HTML and
// injects a decoding script: our CSP blocks that script and React then sees
// different text than it rendered (hydration error #418). Splitting the
// address around a tag keeps it looking the same while Cloudflare no longer
// recognises it. Works in server and client components.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function Email({ address }: { address: string }) {
  const at = address.lastIndexOf("@");
  if (at < 1) return <>{address}</>;
  return (
    <span className="whitespace-nowrap">
      {address.slice(0, at)}
      <span>@</span>
      {address.slice(at + 1)}
    </span>
  );
}

// Text that may contain addresses: each one is rendered with <Email>.
export function SafeText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(EMAIL)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    parts.push(<Email key={index} address={match[0]} />);
    last = index + match[0].length;
  }
  if (parts.length === 0) return <>{text}</>;
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
