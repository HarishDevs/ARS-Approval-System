// #9 @mentions in comments, plain text: "@" followed by a User ID. An email
// address (name@company) is not a mention: the "@" must start a word.
export const MENTION_MAX = 10;
const MENTION = /(^|[^A-Za-z0-9._@-])@([A-Za-z0-9][A-Za-z0-9._-]{1,39})/g;

export function parseMentions(text: string): string[] {
  const found = new Map<string, string>();
  for (const match of text.matchAll(MENTION)) {
    const loginId = match[2]!.replace(/[._-]+$/, "");
    if (loginId.length >= 2 && !found.has(loginId.toLowerCase())) found.set(loginId.toLowerCase(), loginId);
    if (found.size >= MENTION_MAX) break;
  }
  return [...found.values()];
}
