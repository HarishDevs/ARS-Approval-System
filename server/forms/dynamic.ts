// Smart forms (EN-01..EN-03, unified prompt F03/FN1). Pure: used by the
// browser for live feedback and by the server, which always decides.
//  - showIf / requiredIf: a field appears, or becomes required, when a rule
//    about another field holds.
//  - CALC: a value worked out from other fields with a small formula
//    language (numbers, field keys, + - * /, brackets, round()). Parsed into
//    a tree; never eval. The server recomputes it and ignores what was sent.
//  - LINE_ITEMS: description, quantity, rate and GST %. Money is integer
//    paise (BigInt multiplication), so no floating-point error reaches a total.

export const RULE_OPERATORS = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "FILLED", "EMPTY"] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];
export interface FieldRule {
  field: string;
  op: RuleOperator;
  value?: string;
}

export const RULE_WORDS: Record<RuleOperator, string> = {
  EQ: "is",
  NEQ: "is not",
  GT: "is more than",
  GTE: "is at least",
  LT: "is less than",
  LTE: "is at most",
  FILLED: "is filled in",
  EMPTY: "is empty",
};

type Value = string | number | boolean | null | undefined | readonly (string | number)[];

const isEmpty = (value: Value) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
const asNumber = (value: Value): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[,\s₹]/g, "");
  if (cleaned === "") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
};

export function ruleHolds(rule: FieldRule, values: Record<string, Value>): boolean {
  const value = values[rule.field];
  if (rule.op === "FILLED") return !isEmpty(value);
  if (rule.op === "EMPTY") return isEmpty(value);
  if (isEmpty(value)) return false;
  const expected = rule.value ?? "";
  if (Array.isArray(value)) {
    const has = value.some((item) => String(item).trim().toLowerCase() === expected.trim().toLowerCase());
    return rule.op === "EQ" ? has : rule.op === "NEQ" ? !has : false;
  }
  if (rule.op === "EQ" || rule.op === "NEQ") {
    const left = asNumber(value);
    const right = asNumber(expected);
    const same = left !== null && right !== null ? left === right : String(value).trim().toLowerCase() === expected.trim().toLowerCase();
    return rule.op === "EQ" ? same : !same;
  }
  const left = asNumber(value);
  const right = asNumber(expected);
  if (left === null || right === null) return false;
  if (rule.op === "GT") return left > right;
  if (rule.op === "GTE") return left >= right;
  if (rule.op === "LT") return left < right;
  return left <= right;
}

export function describeRule(rule: FieldRule, labelOf: (key: string) => string): string {
  return `${labelOf(rule.field)} ${RULE_WORDS[rule.op]}${rule.op === "FILLED" || rule.op === "EMPTY" ? "" : ` ${rule.value ?? ""}`}`.trim();
}

// ---- formulas -----------------------------------------------------------------
export type Expr =
  | { kind: "num"; value: number }
  | { kind: "field"; key: string }
  | { kind: "neg"; arg: Expr }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; left: Expr; right: Expr }
  | { kind: "round"; arg: Expr; digits: number };

export class FormulaError extends Error {}

export function parseFormula(source: string): Expr {
  const tokens = source.match(/\d+(?:\.\d+)?|[a-z][a-z0-9_]*|[-+*/(),]|\S/g) ?? [];
  let index = 0;
  const peek = () => tokens[index];
  const take = (expected?: string) => {
    const token = tokens[index];
    if (token === undefined) throw new FormulaError("The formula ends too early.");
    if (expected && token !== expected) throw new FormulaError(`Expected "${expected}" but found "${token}".`);
    index += 1;
    return token;
  };
  const primary = (): Expr => {
    const token = take();
    if (/^\d/.test(token)) return { kind: "num", value: Number(token) };
    if (token === "(") {
      const inner = sum();
      take(")");
      return inner;
    }
    if (token === "-") return { kind: "neg", arg: primary() };
    if (token === "round") {
      take("(");
      const arg = sum();
      let digits = 2;
      if (peek() === ",") {
        take(",");
        const d = take();
        if (!/^\d$/.test(d) || Number(d) > 4) throw new FormulaError("round() takes 0 to 4 decimal places.");
        digits = Number(d);
      }
      take(")");
      return { kind: "round", arg, digits };
    }
    if (/^[a-z][a-z0-9_]*$/.test(token)) return { kind: "field", key: token };
    throw new FormulaError(`"${token}" isn't allowed in a formula.`);
  };
  const product = (): Expr => {
    let left = primary();
    while (peek() === "*" || peek() === "/") {
      const op = take() as "*" | "/";
      left = { kind: "bin", op, left, right: primary() };
    }
    return left;
  };
  const sum = (): Expr => {
    let left = product();
    while (peek() === "+" || peek() === "-") {
      const op = take() as "+" | "-";
      left = { kind: "bin", op, left, right: product() };
    }
    return left;
  };
  if (tokens.length === 0) throw new FormulaError("Write a formula, e.g. quantity * rate.");
  if (tokens.length > 200) throw new FormulaError("The formula is too long.");
  const tree = sum();
  if (index !== tokens.length) throw new FormulaError(`Unexpected "${tokens[index]}".`);
  return tree;
}

export function formulaFields(expr: Expr, into: Set<string> = new Set()): Set<string> {
  if (expr.kind === "field") into.add(expr.key);
  if (expr.kind === "neg" || expr.kind === "round") formulaFields(expr.arg, into);
  if (expr.kind === "bin") {
    formulaFields(expr.left, into);
    formulaFields(expr.right, into);
  }
  return into;
}

// Rounded half away from zero, after a tiny correction for binary fractions.
export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return (Math.sign(value) * Math.round(Math.abs(value) * factor + 1e-9)) / factor;
}

// null when an input is missing or a division by zero happens.
export function evaluateFormula(expr: Expr, values: Record<string, Value>): number | null {
  switch (expr.kind) {
    case "num":
      return expr.value;
    case "field":
      return asNumber(values[expr.key]);
    case "neg": {
      const value = evaluateFormula(expr.arg, values);
      return value === null ? null : -value;
    }
    case "round": {
      const value = evaluateFormula(expr.arg, values);
      return value === null ? null : roundTo(value, expr.digits);
    }
    case "bin": {
      const left = evaluateFormula(expr.left, values);
      const right = evaluateFormula(expr.right, values);
      if (left === null || right === null) return null;
      if (expr.op === "+") return left + right;
      if (expr.op === "-") return left - right;
      if (expr.op === "*") return left * right;
      return right === 0 ? null : left / right;
    }
  }
}

// ---- line items ------------------------------------------------------------------
export interface LineInput {
  description: string;
  quantity: string;
  rate: string;
  gst?: string;
}
export interface Line {
  description: string;
  quantity: string; // as entered, normalised (up to 3 decimals)
  rate: string; // rupees, up to 2 decimals
  gst: string; // percent, up to 2 decimals
  amountPaise: number; // quantity × rate, rounded to the paisa
  taxPaise: number;
  totalPaise: number;
}
export const MAX_LINES = 100;

// "12.5" with up to `places` decimals → integer in 10^-places units.
function scaled(text: string, places: number): bigint | null {
  const cleaned = text.replace(/[,\s₹]/g, "");
  if (!new RegExp(`^\\d{1,12}(\\.\\d{1,${places}})?$`).test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return BigInt(whole!) * 10n ** BigInt(places) + BigInt((fraction + "0".repeat(places)).slice(0, places) || "0");
}
// a / b rounded half up, both positive BigInt.
const divRound = (a: bigint, b: bigint) => (a * 2n + b) / (2n * b);

export function computeLine(input: LineInput): { ok: true; line: Line } | { ok: false; message: string } {
  const description = input.description.trim();
  if (!description) return { ok: false, message: "Each line needs a description." };
  if (description.length > 200) return { ok: false, message: "Keep descriptions to 200 characters." };
  const qty = scaled(input.quantity, 3); // milli-units
  if (qty === null || qty === 0n) return { ok: false, message: `"${description}": enter a quantity above 0 (up to 3 decimals).` };
  const rate = scaled(input.rate, 2); // paise
  if (rate === null) return { ok: false, message: `"${description}": enter a rate in rupees (up to 2 decimals).` };
  const gst = scaled(input.gst?.trim() ? input.gst : "0", 2); // basis points
  if (gst === null || gst > 10000n) return { ok: false, message: `"${description}": GST must be between 0 and 100 %.` };
  const amount = divRound(qty * rate, 1000n);
  const tax = divRound(amount * gst, 10000n);
  const total = amount + tax;
  if (total > 10n ** 15n) return { ok: false, message: `"${description}": the amount is too large.` };
  const fmt = (value: bigint, places: number) => {
    const text = value.toString().padStart(places + 1, "0");
    const whole = text.slice(0, -places);
    const fraction = text.slice(-places).replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole;
  };
  return { ok: true, line: { description, quantity: fmt(qty, 3), rate: fmt(rate, 2), gst: fmt(gst, 2), amountPaise: Number(amount), taxPaise: Number(tax), totalPaise: Number(total) } };
}

export function computeLines(inputs: readonly LineInput[]): { ok: true; lines: Line[]; totalPaise: number } | { ok: false; message: string } {
  if (inputs.length > MAX_LINES) return { ok: false, message: `Use at most ${MAX_LINES} lines.` };
  const lines: Line[] = [];
  let total = 0;
  for (const input of inputs) {
    const result = computeLine(input);
    if (!result.ok) return result;
    lines.push(result.line);
    total += result.line.totalPaise;
  }
  return { ok: true, lines, totalPaise: total };
}

export const paiseToRupees = (paise: number) => Math.round(paise) / 100;
export const formatPaise = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---- dependency order and cycles ------------------------------------------------
export interface DynamicField {
  key: string;
  type: string;
  showIf?: FieldRule;
  requiredIf?: FieldRule;
  formula?: string;
}

// Keys each field depends on (its rules and its formula).
export function dependencies(field: DynamicField): string[] {
  const keys = new Set<string>();
  if (field.showIf) keys.add(field.showIf.field);
  if (field.requiredIf) keys.add(field.requiredIf.field);
  if (field.type === "CALC" && field.formula) {
    try {
      formulaFields(parseFormula(field.formula), keys);
    } catch {
      // reported by the form check
    }
  }
  keys.delete(field.key);
  return [...keys];
}

// Fields in an order where everything a field depends on comes first; null
// when there is a cycle (the form check refuses such a form).
export function dependencyOrder(fields: readonly DynamicField[]): string[] | null {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const state = new Map<string, "visiting" | "done">();
  const order: string[] = [];
  const visit = (key: string): boolean => {
    const mark = state.get(key);
    if (mark === "done") return true;
    if (mark === "visiting") return false;
    state.set(key, "visiting");
    const field = byKey.get(key);
    if (field) for (const dependency of dependencies(field)) if (byKey.has(dependency) && !visit(dependency)) return false;
    state.set(key, "done");
    order.push(key);
    return true;
  };
  for (const field of fields) if (!visit(field.key)) return null;
  return order;
}

// Which fields are shown, given the current values. A field hidden by its
// rule is treated as empty by the fields after it.
export function visibleFields(fields: readonly DynamicField[], values: Record<string, Value>): Set<string> {
  const order = dependencyOrder(fields) ?? fields.map((field) => field.key);
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const visible = new Set<string>();
  const effective: Record<string, Value> = { ...values };
  for (const key of order) {
    const field = byKey.get(key)!;
    const shown = !field.showIf || ruleHolds(field.showIf, effective);
    if (shown) visible.add(key);
    else effective[key] = undefined;
  }
  return visible;
}
