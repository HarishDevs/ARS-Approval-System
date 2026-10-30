// D-216 (owner: "a multilevel hierarchy based on the reporting manager of
// each user"): everyone below a person in the reporting chain, at every
// level (their reports, their reports' reports, …). Pure; a loop in bad data
// (A reports to B, B to A) is cut, never followed forever.
export function teamBelow(managerOf: ReadonlyMap<number, number | null>, managerId: number): number[] {
  const reports = new Map<number, number[]>();
  for (const [person, manager] of managerOf) if (manager !== null && manager !== person) reports.set(manager, [...(reports.get(manager) ?? []), person]);
  const out: number[] = [];
  const seen = new Set<number>([managerId]);
  const queue = [...(reports.get(managerId) ?? [])];
  while (queue.length) {
    const person = queue.shift()!;
    if (seen.has(person)) continue;
    seen.add(person);
    out.push(person);
    queue.push(...(reports.get(person) ?? []));
  }
  return out;
}

// The chain above a person (their manager, the manager's manager, …).
export function chainAbove(managerOf: ReadonlyMap<number, number | null>, personId: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>([personId]);
  let current = managerOf.get(personId) ?? null;
  while (current !== null && !seen.has(current)) {
    out.push(current);
    seen.add(current);
    current = managerOf.get(current) ?? null;
  }
  return out;
}
