export type ParsedReceipt = {
  amount: number;                              // in ₹
  direction: "expense" | "income";             // paid/debited => expense; received/credited => income
  merchant: string;                             // counterparty or brand
  source: "gpay" | "phonepe" | "paytm" | "cred" | "unknown"; // best-guess app that generated the receipt
  category: string;                             // heuristic auto-category
  transactionId?: string;                       // UPI/order id if found
  raw: string;                                  // original pasted text
};

const AMOUNT_RE_UNUSED_KEPT_FOR_DOCS = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unusedAmountRe = AMOUNT_RE_UNUSED_KEPT_FOR_DOCS;
const DIR_EXPENSE_RE = /\b(paid|sent|debited|payment successful|you paid|amount paid|money sent|purchase(?:d)?|spent|withdrawn|withdrew)\b/i;
const DIR_INCOME_RE = /\b(received|credited|refund(?:ed)?|money received|has been credited|deposited)\b/i;
const BALANCE_HINT_RE = /\b(bal(?:ance)?|avl\s*bal|available)\b/i;
// Block OTP, verification, authorization, pre-auth messages — these are NOT transactions
const BLOCK_OTP_RE = /\b(otp|verification|one-time password|confirm|pre-auth|authorization|security|validate|confirm identity|card not present|cvv|unconfirmed|pending|approval)\b/i;
const BLOCK_PROMO_RE = /\b(cashback|reward|bonus|offer|discount|promo|coupon|voucher|limited|flash sale|congratulations|won|lottery|claim|refund pending)\b/i;

// Bank/wallet SMS sender codes documentation-only reference (used inline in parseSmsBundle)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _BANK_SENDER_RE = /\b(HDFCBK|HDFCBI|SBIINB|SBIBUY|SBI-?INB|ICICIT|ICICIB|AXISBK|KOTAKB|PNBBNK|BOBIBN|CBSSBI|CANBNK|INDBNK|IDBIBK|IOBBNK|UCOBNK|YESBNK|IPBSMS|PAYTMB|PhonePe|GPAYIN|CREDPY|AMZNPY|FRPAYX)\b/i;

// Merchant / counterparty extraction — capture the token after "to" / "from" / "for" / "at" up to a delimiter.
// Deliberately EXCLUDE `.` from the capture char class so "MERCHANT. Ref 123" stops at "MERCHANT".
const TO_RE = /\bto\s+(?:VPA\s+)?([A-Za-z][A-Za-z0-9 &'’\-]{1,60})(?=[\s\n·|.,]|$|\s+(?:via|UPI|on|Transaction|Order|Ref|txn|VPA))/i;
const FROM_RE = /\bfrom\s+([A-Za-z][A-Za-z0-9 &'’\-]{1,60})(?=[\s\n·|.,]|$|\s+(?:via|UPI|on|Transaction|Order|Ref|txn|VPA))/i;
const VPA_RE = /([a-zA-Z0-9._\-]{2,})@([a-zA-Z]{3,})/; // e.g. zomato@ybl → zomato
const FOR_RE = /\bfor\s+([A-Za-z][A-Za-z0-9 &'’\-]{1,60})(?=[\s\n·|.,]|$|\s+(?:via|UPI|on|Transaction|Order|Ref|txn|VPA))/i;
const AT_RE = /\bat\s+([A-Za-z][A-Za-z0-9 &'’\-]{1,60})(?=[\s\n·|.,]|$|\s+(?:via|UPI|on|Transaction|Order|Ref|txn|VPA))/i;

// Source app detection — regex-based to enforce word boundaries ("cred" must not match inside "credited")
const SOURCE_HINTS: [RegExp, ParsedReceipt["source"]][] = [
  [/\bgoogle pay\b|\bgpay\b|\bGPAYIN\b|@ok(?:hdfcbank|axis|sbi|icici)/i, "gpay"],
  [/\bphonepe\b|@(?:ybl|ibl|axl)\b|txn id:\s*t\d/i, "phonepe"],
  [/\bpaytm\b|@paytm\b|\bPAYTMB\b/i, "paytm"],
  [/\bcred\b(?:\s+coins|\s+app)?|\bCREDPY\b|\bcredit\s+card\s+bill\b/i, "cred"],
];

// Transaction id patterns
const TXN_ID_RES = [
  /UPI\s*(?:transaction|txn|ref(?:erence)?)?\s*(?:id|no\.?|number)?[:\s]+([A-Za-z0-9]{6,32})/i,
  /Transaction\s*(?:id|no\.?)[:\s]+([A-Za-z0-9]{6,32})/i,
  /Order\s*(?:id|no\.?)[:\s]+([A-Za-z0-9]{6,32})/i,
  /Ref\s*(?:no\.?|id)?[:\s]+([A-Za-z0-9]{6,32})/i,
];

// Category heuristics — matched against the merchant string
const CATEGORY_RULES: [RegExp, string][] = [
  [/zomato|swiggy|domino|pizza|kfc|mcdonald|starbucks|barista|chaayos|haldiram|biriyani|food|restaurant|cafe|dhaba|hotel(?!s?\s*booking)/i, "Food"],
  [/uber|ola|rapido|blabla|irctc|redbus|abhibus|indigo|vistara|spicejet|air ?india|makemytrip|goibibo|yatra|petrol|hp|iocl|bpcl|shell/i, "Transport"],
  [/amazon|flipkart|myntra|ajio|meesho|snapdeal|nykaa|shopclues|tatacliq|croma|reliance digital|lifestyle|max\b|zara|h&m|decathlon/i, "Shopping"],
  [/airtel|jio|vi\b|vodafone|idea|bsnl|tata sky|d2h|netflix|prime|hotstar|spotify|youtube|electricity|bijli|water|gas|bses|torrent|adani/i, "Bills"],
  [/rent|landlord|society|maintenance|nobroker|housing/i, "Rent"],
  [/apollo|pharm|medplus|1mg|netmeds|hospital|clinic|doctor|dental|health|medicine/i, "Health"],
  [/mmt|makemytrip|goibibo|oyo|treebo|airbnb|booking\.com|expedia|hotels?\.com/i, "Travel"],
  [/salary|payroll/i, "Salary"],
  [/interest|savings? interest|dividend/i, "Interest"],
  [/zerodha|groww|upstox|angel|kite|coin\.zerodha|inr trading/i, "Trading"],
];

const cleanNum = (s: string) => Number(s.replace(/,/g, ""));

const trimMerchant = (raw: string): string => {
  let m = raw.trim().replace(/[.,·|;:!?)}\]]+$/g, "").trim();
  // If capture picked up trailing "UPI" / "VPA" / "on <date>" fragments, strip them.
  m = m.replace(/\b(via|UPI|on\s+\d.*|VPA|reference.*|txn.*|transaction.*|order.*|for\s+.*)$/i, "").trim();
  // Turn a VPA like "zomato@ybl" into "Zomato"
  const vpaMatch = m.match(VPA_RE);
  if (vpaMatch) m = vpaMatch[1];
  // Capitalise first letter of each word
  m = m.replace(/[_\-]+/g, " ")
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ")
    .trim();
  return m || "Unknown";
};

const detectSource = (text: string): ParsedReceipt["source"] => {
  for (const [re, src] of SOURCE_HINTS) {
    if (re.test(text)) return src;
  }
  return "unknown";
};

const detectCategory = (merchant: string, source: ParsedReceipt["source"], direction: ParsedReceipt["direction"]): string => {
  if (direction === "income") {
    if (/salary|payroll/i.test(merchant)) return "Salary";
    if (source === "cred") return "Interest";
    return "Other";
  }
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(merchant)) return cat;
  }
  if (source === "cred") return "Bills"; // CRED usually pays credit card bills
  return "Other";
};

const detectTxnId = (text: string): string | undefined => {
  for (const re of TXN_ID_RES) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return undefined;
};

/** Attempt to parse a pasted UPI receipt / notification. Returns null if not confidently a receipt. */
export function parseReceipt(text: string): ParsedReceipt | null {
  if (!text || text.trim().length < 6) return null;
  const raw = text.trim();

  // BLOCK OTP/pre-auth/promo messages upfront — these are NOT transactions
  if (BLOCK_OTP_RE.test(raw) || BLOCK_PROMO_RE.test(raw)) {
    return null;
  }

  // Extract amount — prefer the amount NOT associated with "Bal / Avl Bal / Available Balance".
  // Strategy: collect all amount matches, then pick the first one that isn't immediately preceded
  // by a balance keyword within 20 chars.
  const allAmounts = Array.from(raw.matchAll(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi));
  if (allAmounts.length === 0) return null;
  const isNearBalance = (idx: number) => {
    const window = raw.slice(Math.max(0, idx - 22), idx).toLowerCase();
    return /\b(bal(?:ance)?|avl\s*bal|available)\b/i.test(window);
  };
  let chosen = allAmounts.find((m) => !isNearBalance(m.index ?? 0)) || allAmounts[0];
  const amount = cleanNum(chosen[1]);
  if (!isFinite(amount) || amount <= 0) return null;

  const isIncome = DIR_INCOME_RE.test(raw);
  const isExpense = DIR_EXPENSE_RE.test(raw);
  // CRITICAL: Require BOTH amount AND a direction keyword. No defaulting to "expense"!
  // This prevents promo SMS without clear direction keywords from being imported as expenses.
  if (!isIncome && !isExpense) {
    // No transaction direction found — reject the SMS
    return null;
  }
  const direction: ParsedReceipt["direction"] = isIncome && !isExpense ? "income" : "expense";

  // For merchants, try VPA extraction first (highest signal), then structured phrases.
  const vpaHit = raw.match(VPA_RE)?.[1];
  let merchantRaw = "";
  if (direction === "income") {
    merchantRaw = vpaHit || raw.match(FROM_RE)?.[1] || "";
  } else {
    merchantRaw = vpaHit || raw.match(TO_RE)?.[1] || raw.match(FOR_RE)?.[1] || raw.match(AT_RE)?.[1] || "";
  }
  // Reject noise captures like bare "VPA", "AC", "the", "on", etc.
  if (merchantRaw && /^(vpa|a\/?c|the|on|via|upi|ref|txn|from|for|at|to|by)$/i.test(merchantRaw.trim())) {
    merchantRaw = "";
  }
  const merchant = trimMerchant(merchantRaw || "Unknown");
  const source = detectSource(raw);
  const category = detectCategory(merchant, source, direction);
  const transactionId = detectTxnId(raw);

  // Discard balance-only SMS with no direction words (e.g. "Avl Bal Rs 5,000") — those aren't transactions.
  if (!isIncome && !isExpense && BALANCE_HINT_RE.test(raw)) return null;

  return { amount, direction, merchant, source, category, transactionId, raw };
}

/**
 * Split a chunk of text (e.g. many pasted SMS at once) into individual receipts and parse each.
 * Splits on:
 *   - blank lines
 *   - "---" separators
 *   - typical bank sender codes at the start of a line (e.g. "HDFCBK: …")
 * Returns only successfully-parsed receipts.
 */
export function parseSmsBundle(text: string): ParsedReceipt[] {
  if (!text || !text.trim()) return [];
  // First split on double-newlines or "---" separators.
  let chunks = text.split(/\n\s*\n|^\s*-{3,}\s*$/gm).map((c) => c.trim()).filter(Boolean);
  // Further split any chunk that clearly contains multiple bank-sender messages on the same line.
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    // If chunk contains ≥2 bank sender codes at different positions, split on each subsequent one.
    const positions: number[] = [];
    let m: RegExpExecArray | null;
    const re = /(?:^|\n)\s*(HDFCBK|HDFCBI|SBIINB|SBIBUY|ICICIT|ICICIB|AXISBK|KOTAKB|PNBBNK|BOBIBN|CBSSBI|CANBNK|INDBNK|IDBIBK|IOBBNK|UCOBNK|YESBNK|IPBSMS|PAYTMB|PhonePe|GPAYIN|CREDPY|AMZNPY|FRPAYX)[\s:\-]/gi;
    while ((m = re.exec(chunk)) !== null) positions.push(m.index);
    if (positions.length <= 1) {
      finalChunks.push(chunk);
    } else {
      for (let i = 0; i < positions.length; i++) {
        const start = positions[i];
        const end = i + 1 < positions.length ? positions[i + 1] : chunk.length;
        finalChunks.push(chunk.slice(start, end).trim());
      }
    }
  }
  const out: ParsedReceipt[] = [];
  for (const chunk of finalChunks) {
    const p = parseReceipt(chunk);
    if (p) out.push(p);
  }
  return out;
}

export const sourceLabel: Record<ParsedReceipt["source"], string> = {
  gpay: "Google Pay",
  phonepe: "PhonePe",
  paytm: "Paytm",
  cred: "CRED",
  unknown: "UPI receipt",
};
