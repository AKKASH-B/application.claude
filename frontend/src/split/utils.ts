import type { DraftMember, SplitMode } from "./types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Compute per-member owed amounts based on mode.
 * Handles paise rounding so the sum ALWAYS exactly equals total.
 * Remainder (positive or negative) is allocated to the payer so totals reconcile.
 */
export function calculateOwedAmounts(
  total: number,
  mode: SplitMode,
  members: DraftMember[],
): Record<string, number> {
  const map: Record<string, number> = {};
  if (!members.length || !total || total <= 0) {
    members.forEach((m) => (map[m.id] = 0));
    return map;
  }

  const payerId = members.find((m) => m.is_payer)?.id ?? members[0].id;

  if (mode === "equal") {
    const each = round2(total / members.length);
    members.forEach((m) => (map[m.id] = each));
    // Reconcile drift on payer.
    const drift = round2(total - each * members.length);
    map[payerId] = round2(map[payerId] + drift);
    return map;
  }

  if (mode === "unequal") {
    let sum = 0;
    members.forEach((m) => {
      const val = Number(m.custom_amount);
      const clean = isFinite(val) && val > 0 ? round2(val) : 0;
      map[m.id] = clean;
      sum = round2(sum + clean);
    });
    return map;
  }

  // shares
  const totalShares = members.reduce((s, m) => s + (isFinite(m.share_value) ? Math.max(0, m.share_value) : 0), 0);
  if (totalShares <= 0) {
    members.forEach((m) => (map[m.id] = 0));
    return map;
  }
  let running = 0;
  const lastIdx = members.length - 1;
  members.forEach((m, idx) => {
    if (idx === lastIdx) {
      map[m.id] = round2(total - running);
    } else {
      const share = round2((Math.max(0, m.share_value) / totalShares) * total);
      map[m.id] = share;
      running = round2(running + share);
    }
  });
  // If payer isn't last, still reconcile to payer for consistency
  const currentSum = Object.values(map).reduce((s, v) => s + v, 0);
  const drift = round2(total - currentSum);
  if (Math.abs(drift) > 0.001) {
    map[payerId] = round2(map[payerId] + drift);
  }
  return map;
}

export function summariseSplit(
  total: number,
  mode: SplitMode,
  members: DraftMember[],
): { owedMap: Record<string, number>; sum: number; valid: boolean; reason?: string } {
  if (members.length < 2) return { owedMap: {}, sum: 0, valid: false, reason: "Add at least 2 members" };
  if (members.length > 10) return { owedMap: {}, sum: 0, valid: false, reason: "Max 10 members allowed" };
  if (!total || total <= 0) return { owedMap: {}, sum: 0, valid: false, reason: "Enter a total amount" };

  const owedMap = calculateOwedAmounts(total, mode, members);
  const sum = Object.values(owedMap).reduce((s, v) => s + v, 0);

  // Duplicate name warning (case-insensitive)
  const lowered = members.map((m) => m.name.trim().toLowerCase());
  const dupes = new Set<string>();
  const seen = new Set<string>();
  lowered.forEach((n) => {
    if (!n) return;
    if (seen.has(n)) dupes.add(n);
    seen.add(n);
  });

  if (members.some((m) => !m.name.trim())) {
    return { owedMap, sum, valid: false, reason: "Every member needs a name" };
  }
  if (dupes.size > 0) {
    return { owedMap, sum, valid: false, reason: "Two members share a name — rename to save" };
  }
  if (mode === "unequal") {
    if (Math.abs(sum - total) > 0.011) {
      return { owedMap, sum, valid: false, reason: `Amounts add up to ₹${sum.toFixed(2)} — must equal ₹${total.toFixed(2)}` };
    }
  }
  if (mode === "shares") {
    const totalShares = members.reduce((s, m) => s + Math.max(0, m.share_value), 0);
    if (totalShares <= 0) return { owedMap, sum, valid: false, reason: "Assign at least one share" };
  }
  if (Object.values(owedMap).some((v) => v === 0)) {
    return { owedMap, sum, valid: false, reason: "A member has ₹0 owed — remove them or add a share/amount" };
  }
  return { owedMap, sum, valid: true };
}

export const money2 = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const initialsOf = (name: string) => {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const AVATAR_COLORS = ["#4A6B5D", "#C28E38", "#8B5FBF", "#3B7A9E", "#B23B3B", "#5F8B4C", "#D97706", "#0E7C86", "#7A4E3B", "#6B4C93"];
export const avatarColor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

let uid = 0;
export const newLocalId = () => `m_${Date.now().toString(36)}_${(++uid).toString(36)}`;
