// D-178: what a person sees when an answer fails. The technical reason stays
// in the database for the Super Admin (AI settings → Recent failed answers).
// Pure.
const RULES: readonly [RegExp, string][] = [
  [/^stopped\.?$/i, "Stopped."],
  [/still being answered/i, "This question is still being answered."],
  [/rate limit|quota|too many|limit for today|daily limit/i, "I'm getting a lot of questions right now. Please try again in a minute."],
  [/refused the api key|insufficient balance|http 402|needs an api key/i, "I'm not available right now. IT has been notified, so please try again later."],
  [/doesn't know this model/i, "I'm not available right now. IT has been notified, so please try again later."],
  [/didn't answer in time|timeout|timed out/i, "That took too long. Please try again, or ask for something a little narrower."],
  [/unavailable|couldn't reach/i, "I can't reach the AI service right now. Please try again in a moment."],
  [/empty answer|ran out of room|kept asking|couldn't be read|tool call|tool choice/i, "I couldn't put that answer together. Try asking it a little differently."],
  [/approved for business data/i, "I can't use company data yet. IT needs to approve an AI provider for it."],
  [/switched off|emergency/i, "Pico Bot is switched off for now."],
];

export function friendlyError(error: string | null | undefined): string {
  if (!error) return "I couldn't answer just now. Please try again.";
  for (const [pattern, text] of RULES) if (pattern.test(error)) return text;
  // Messages already written for people (no provider name or HTTP detail) pass through.
  return /HTTP \d{3}|\(|:\s/.test(error) ? "I couldn't answer just now. Please try again." : error;
}
