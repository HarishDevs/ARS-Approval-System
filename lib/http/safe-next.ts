// Where to go after sign-in (?next=...). Only a path inside this app: never
// another site. Browsers read "/\evil.com" and "/<tab>/evil.com" as
// "//evil.com", so backslashes and any whitespace or control character are
// refused too, and the result must resolve to this origin (audit S-02).
const BASE = "https://app.invalid";

export function safeNextPath(next: string | string[] | undefined | null, fallback = "/users"): string {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || value.length > 512 || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
