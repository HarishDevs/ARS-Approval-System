import "server-only";
import { after } from "next/server";
import { logError } from "@/lib/logging/logger";

// v1.50.2 (owner: "when creating a user it first shows a failure message but
// creates the user"): email and WhatsApp can take seconds each, and the page
// gives up after 30 s ("This is taking longer than expected") although the
// change is saved. Messages therefore go out just after the answer is sent.
// They are already in the outbox (or are their own record), and the job
// runner retries anything unsent every 5 minutes, so nothing is lost. Outside
// a request (job runner, scripts, tests) there is no "after", so the work
// runs straight away, as before.
export async function afterResponse(label: string, work: () => Promise<unknown>): Promise<void> {
  const run = () =>
    work().then(
      () => undefined,
      (error: unknown) => logError(`${label} failed`, error),
    );
  try {
    after(run);
  } catch {
    await run();
  }
}
