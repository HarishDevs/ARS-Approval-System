// D-273 (owner's journey brief): the journey's event controller. Pure: given
// the journey on screen and the newer one from the server, it says which
// scenes to play (drive, unload, stamp, reload, finish). The server's state is
// the truth; scenes only animate the change between two confirmed states, so
// repeated or older news plays nothing and a refresh draws the current state
// at once (no replay).
import type { Road } from "@/server/approvals/road";

export type StampMark = "approve" | "reject" | "return";

export type Scene =
  | { kind: "seal" } // document → sealed envelope → into the van (just after submitting only)
  | { kind: "drive"; from: number; to: number } // between van stops (track positions)
  | { kind: "unload"; at: number } // door opens, the envelope comes out and unfolds
  | { kind: "stamp"; at: number; mark: StampMark } // the decision's stamp on the document
  | { kind: "reload"; at: number } // folds, back into the van, door closes
  | { kind: "finish" }; // at the flag: the whole road completes

export const SCENE_MS: Record<Scene["kind"], number> = { seal: 2400, drive: 1500, unload: 1100, stamp: 900, reload: 1000, finish: 900 };

// Track positions: checkpoint i sits at i; the flag at last + FLAG.
export const FLAG = 0.75;
const BESIDE = 0.34; // the van stops just before the point it's at

export const flagPos = (road: Road) => road.checkpoints.length - 1 + FLAG;
// Fully approved, the van pulls up at the flag (its nose at the pole, the flag in view).
export const arrivedPos = (road: Road) => flagPos(road) - 0.3;

// Where the van stands for a road (what a refresh draws).
export function vanStop(road: Road): number {
  if (road.outcome === "APPROVED") return arrivedPos(road);
  if (road.checkpoints[road.vanAt]?.state === "returned") return 0;
  if (road.vanAt === 0) return 0;
  return road.vanAt - BESIDE;
}

// Is the document out of the van (under review) at the van's point?
export function documentOut(road: Road): boolean {
  if (road.outcome === "APPROVED" || road.outcome === "CANCELLED") return false;
  const state = road.checkpoints[road.vanAt]?.state;
  return road.vanAt > 0 && (state === "current" || state === "hold" || state === "blocked" || state === "rejected");
}

const beside = (index: number) => (index === 0 ? 0 : index - BESIDE);

export function planScenes(previous: Road | null, next: Road, options: { fresh?: boolean } = {}): Scene[] {
  if (!previous) {
    // The first draw: straight to the current state, except right after submitting.
    if (!options.fresh) return [];
    const out: Scene[] = [{ kind: "seal" }];
    if (vanStop(next) > 0) out.push({ kind: "drive", from: 0, to: vanStop(next) });
    if (documentOut(next)) out.push({ kind: "unload", at: next.vanAt });
    return out;
  }
  if (previous.version === next.version) return [];
  const was = previous.checkpoints[previous.vanAt]?.state;
  const now = next.checkpoints[next.vanAt]?.state;

  // Sent back for changes: stamp, reload, reverse to the start.
  if (now === "returned" && was !== "returned") {
    const at = next.vanAt;
    return [
      { kind: "stamp", at, mark: "return" },
      { kind: "reload", at },
      { kind: "drive", from: beside(at), to: 0 },
    ];
  }
  // Resubmitted: from the start to the level waiting now.
  if (was === "returned" && now !== "returned" && !next.outcome) {
    return [{ kind: "drive", from: 0, to: vanStop(next) }, ...(documentOut(next) ? [{ kind: "unload" as const, at: next.vanAt }] : [])];
  }
  // Rejected: a red stamp where it stopped; the van goes no further.
  if (next.outcome === "REJECTED" && previous.outcome !== "REJECTED") {
    const scenes: Scene[] = [];
    if (!documentOut(previous)) scenes.push({ kind: "unload", at: next.vanAt });
    scenes.push({ kind: "stamp", at: next.vanAt, mark: "reject" });
    return scenes;
  }
  if (next.outcome === "CANCELLED" || next.checkpoints.length !== previous.checkpoints.length) return [];

  // Forward: each level finished since, in order. At an approved level the
  // document is stamped and reloaded; a skipped level is driven past.
  const scenes: Scene[] = [];
  const last = next.checkpoints.length; // "past the last point" = the flag
  const target = next.outcome === "APPROVED" ? last : next.vanAt;
  if (target <= previous.vanAt) return [];
  let position = vanStop(previous);
  for (let at = previous.vanAt; at < target; at += 1) {
    if (at > 0 && next.checkpoints[at]?.state === "done") {
      if (at !== previous.vanAt || !documentOut(previous)) scenes.push({ kind: "unload", at });
      scenes.push({ kind: "stamp", at, mark: "approve" }, { kind: "reload", at });
    }
    const following = at + 1;
    const stops = following === target || following >= last || next.checkpoints[following]?.state === "done";
    if (stops) {
      const to = following >= last ? arrivedPos(next) : beside(following);
      scenes.push({ kind: "drive", from: position, to });
      position = to;
    }
  }
  if (next.outcome === "APPROVED") scenes.push({ kind: "finish" });
  else if (documentOut(next)) scenes.push({ kind: "unload", at: next.vanAt });
  return scenes;
}

// While scenes play, a checkpoint shows its new state once the van has dealt
// with it: points up to `upTo` from the new road, the rest from the old one.
export function blendRoad(previous: Road, next: Road, upTo: number): Road {
  if (previous.checkpoints.length !== next.checkpoints.length) return next;
  return { ...next, checkpoints: next.checkpoints.map((point, index) => (index <= upTo ? point : previous.checkpoints[index]!)) };
}
