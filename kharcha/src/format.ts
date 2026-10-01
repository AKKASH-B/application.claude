const SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "AED ", SGD: "S$", AUD: "A$", CAD: "C$", JPY: "¥" };
export const CURRENCY_LIST = Object.keys(SYMBOLS);

function group(intPart: string, currency: string): string {
  if (currency === "INR") {
    // Indian digit grouping: 12,34,567
    if (intPart.length <= 3) return intPart;
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    return `${rest},${last3}`;
  }
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function money(n: number, currency = "INR", opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const abs = Math.abs(n);
  const showDecimals = opts.decimals ?? (abs < 1000 && Math.round(abs) !== abs);
  const fixed = currency === "JPY" ? Math.round(abs).toString() : abs.toFixed(showDecimals ? 2 : 0);
  const [i, d] = fixed.split(".");
  const body = `${SYMBOLS[currency] ?? ""}${group(i, currency)}${d ? "." + d : ""}`;
  if (n < 0) return `-${body}`;
  return opts.sign && n > 0 ? `+${body}` : body;
}

export const pad = (n: number) => String(n).padStart(2, "0");

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const thisMonth = () => todayISO().slice(0, 7);

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthLabel = (ym: string) => `${FULL_MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const monthShort = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];

export function prettyDate(iso: string): string {
  const t = todayISO();
  if (iso === t) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (iso === `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`) return "Yesterday";
  const d = new Date(iso + "T00:00:00");
  return `${d.toLocaleDateString(undefined, { weekday: "short" })}, ${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const dim = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(Math.min(d, dim))}`;
}

/** Whole months from `fromIso` to `toIso` (at least 1) — used for the "save per month" nudge. */
export function monthsBetween(fromIso: string, toIso: string): number {
  const a = fromIso.split("-").map(Number);
  const b = toIso.split("-").map(Number);
  return Math.max(1, (b[0] - a[0]) * 12 + (b[1] - a[1]) + (b[2] >= a[2] ? 1 : 0));
}

/** Safe calculator: numbers, + - × ÷ * / and parentheses. Returns null when the input isn't valid. */
export function evalExpr(input: string): number | null {
  const src = input.replace(/[×x]/gi, "*").replace(/÷/g, "/").replace(/,/g, "").replace(/\s+/g, "");
  if (!src || !/^[0-9+\-*/().]+$/.test(src)) return null;
  let i = 0;
  const peek = () => src[i];
  function number(): number {
    const start = i;
    while (i < src.length && /[0-9.]/.test(src[i])) i++;
    const s = src.slice(start, i);
    if (!s || s === "." || (s.match(/\./g) || []).length > 1) throw new Error("num");
    return parseFloat(s);
  }
  function factor(): number {
    if (peek() === "-") { i++; return -factor(); }
    if (peek() === "+") { i++; return factor(); }
    if (peek() === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") throw new Error("paren");
      i++;
      return v;
    }
    return number();
  }
  function term(): number {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const r = factor();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  try {
    const v = expr();
    if (i !== src.length || !isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  } catch {
    return null;
  }
}

export const CATEGORIES: Record<"expense" | "income" | "savings", string[]> = {
  expense: ["Food", "Groceries", "Transport", "Bills", "Rent", "Shopping", "Health", "Entertainment", "Travel", "Education", "Subscriptions", "Other"],
  income: ["Salary", "Freelance", "Interest", "Gift", "Other"],
  savings: ["Emergency Fund", "Investment", "Goal", "Retirement", "Other"],
};
export const TYPE_LABEL = { expense: "Spent", income: "Received", savings: "Saved" } as const;

export const CATEGORY_ICON: Record<string, string> = {
  Food: "coffee", Groceries: "shopping-cart", Transport: "navigation", Bills: "file-text", Rent: "home", Shopping: "shopping-bag",
  Health: "heart", Entertainment: "film", Travel: "map-pin", Education: "book", Subscriptions: "repeat", Split: "users",
  Salary: "briefcase", Freelance: "edit-3", Interest: "percent", Gift: "gift", "Emergency Fund": "shield", Investment: "trending-up",
  Goal: "target", Retirement: "sunset", Other: "more-horizontal",
};

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 10000000) return `${(a / 10000000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (a >= 100000) return `${(a / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (a >= 1000) return `${(a / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(a));
}
