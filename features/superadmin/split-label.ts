// D-179: a long label keeps its name and moves the explanation into a hover
// hint: "Name (explanation)" or "Name: explanation".
export function splitLabel(label: string): { name: string; hint: string | null } {
  const colon = label.indexOf(": ");
  if (colon > 0 && label.length > 40 && !label.slice(0, colon).includes("(")) return { name: label.slice(0, colon), hint: label.slice(colon + 2) };
  // A trailing "(…)" found by scanning back for its matching "(" (no regex:
  // a nested pattern here backtracked badly on some labels).
  if (label.endsWith(")")) {
    let depth = 0;
    for (let index = label.length - 1; index > 0; index -= 1) {
      if (label[index] === ")") depth += 1;
      else if (label[index] === "(" && --depth === 0) {
        const name = label.slice(0, index).trim();
        if (name) return { name, hint: label.slice(index + 1, -1).trim() };
        break;
      }
    }
  }
  return { name: label, hint: null };
}
