// Pic bot - ai (D-172): how many questions may run at once.
//   - Per person (default 2): a third question while two are waiting is refused
//     straight away, so one person (or many tabs) can't crowd out others.
//   - Everyone (default 10, this server process): when full, a question waits
//     in a short bounded queue (at most QUEUE_FACTOR × the limit, up to
//     MAX_WAIT_MS); past that it is refused as "busy". No question is held
//     for ever, and Stop releases its place.
// GoDaddy Node.js hosting runs ONE process, so in-process counters are exact
// there. With several processes each would have its own counters: the
// per-minute limit (rate_limit_hits in MySQL) still applies to all of them.
const QUEUE_FACTOR = 2;
const MAX_WAIT_MS = 15_000;

interface Waiter {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class LimitError extends Error {
  constructor(
    readonly kind: "PERSON_BUSY" | "SERVER_BUSY" | "CANCELLED",
    message: string,
  ) {
    super(message);
    this.name = "LimitError";
  }
}

export class ConcurrencyGate {
  private running = 0;
  private readonly perPerson = new Map<number, number>();
  private readonly queue: Waiter[] = [];

  stats(): { running: number; queued: number; people: number } {
    return { running: this.running, queued: this.queue.length, people: this.perPerson.size };
  }

  // Resolves to a release function; call it exactly once when the question is done.
  async acquire(personId: number, limits: { perPerson: number; global: number }, signal?: AbortSignal): Promise<() => void> {
    const mine = this.perPerson.get(personId) ?? 0;
    if (mine >= limits.perPerson) throw new LimitError("PERSON_BUSY", `You already have ${mine} question${mine === 1 ? "" : "s"} being answered. Wait for ${mine === 1 ? "it" : "them"} to finish.`);
    this.perPerson.set(personId, mine + 1);
    const releasePerson = () => {
      const now = (this.perPerson.get(personId) ?? 1) - 1;
      if (now <= 0) this.perPerson.delete(personId);
      else this.perPerson.set(personId, now);
    };
    try {
      await this.takeGlobal(limits.global, signal);
    } catch (error) {
      releasePerson();
      throw error;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      releasePerson();
      this.running -= 1;
      const next = this.queue.shift();
      if (next) {
        clearTimeout(next.timer);
        this.running += 1;
        next.resolve(() => undefined);
      }
    };
  }

  private takeGlobal(limit: number, signal?: AbortSignal): Promise<void> {
    if (this.running < limit) {
      this.running += 1;
      return Promise.resolve();
    }
    if (this.queue.length >= limit * QUEUE_FACTOR) return Promise.reject(new LimitError("SERVER_BUSY", "Pico Bot is busy right now. Try again in a minute."));
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve: () => resolve(),
        reject,
        timer: setTimeout(() => {
          this.drop(waiter);
          reject(new LimitError("SERVER_BUSY", "Pico Bot is busy right now. Try again in a minute."));
        }, MAX_WAIT_MS),
      };
      this.queue.push(waiter);
      signal?.addEventListener(
        "abort",
        () => {
          if (this.drop(waiter)) {
            clearTimeout(waiter.timer);
            reject(new LimitError("CANCELLED", "Stopped."));
          }
        },
        { once: true },
      );
    });
  }

  private drop(waiter: Waiter): boolean {
    const index = this.queue.indexOf(waiter);
    if (index === -1) return false;
    this.queue.splice(index, 1);
    return true;
  }
}

// One gate per server process (module scope; holds counts only, never anyone's data).
export const aiGate = new ConcurrencyGate();
