// Single source of truth for calculator behaviour. Used by the Calculator tab and by the
// "Add transaction" calculator popup so the two can never drift apart again.
import { useCallback, useState } from "react";

export type CalcOp = "+" | "-" | "×" | "÷";
export type CalcEntry = { expression: string; result: number };

export const CALC_ERROR = "Can't divide by 0";
export const CALC_OPS: string[] = ["÷", "×", "-", "+"];
export const CALC_KEYS: string[][] = [
  ["C", "÷", "×", "⌫"],
  ["7", "8", "9", "-"],
  ["4", "5", "6", "+"],
  ["1", "2", "3", "="],
  ["0", "."],
];
const MAX_DIGITS = 12;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
// Dividing by zero yields NaN so callers can show an error instead of a wrong number.
export const applyOp = (a: number, b: number, o: CalcOp) =>
  o === "+" ? a + b : o === "-" ? a - b : o === "×" ? a * b : b === 0 ? NaN : a / b;

export function useCalculator() {
  const [current, setCurrent] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<CalcOp | null>(null);
  const [overwrite, setOverwrite] = useState(true);

  const reset = useCallback((initial?: string) => {
    const n = Number(initial);
    setCurrent(initial && Number.isFinite(n) && n > 0 ? String(n) : "0");
    setPrev(null);
    setOp(null);
    setOverwrite(true);
  }, []);

  const fail = () => { setCurrent(CALC_ERROR); setPrev(null); setOp(null); setOverwrite(true); };

  const inputDigit = (d: string) => {
    if (overwrite) { setOverwrite(false); setCurrent(d === "." ? "0." : d); return; }
    if (d === "." && current.includes(".")) return;
    if (current.replace(".", "").length >= MAX_DIGITS) return;
    setCurrent(current === "0" && d !== "." ? d : current + d);
  };

  const chooseOp = (o: CalcOp) => {
    const cur = Number(current);
    if (Number.isNaN(cur)) return; // an error message is showing — wait for a digit
    if (prev !== null && op && !overwrite) {
      const result = round2(applyOp(prev, cur, op));
      if (!Number.isFinite(result)) return fail();
      setPrev(result);
      setCurrent(String(result));
    } else {
      setPrev(cur);
    }
    setOp(o);
    setOverwrite(true);
  };

  const equals = (): CalcEntry | null => {
    if (prev === null || !op) return null;
    const b = Number(current);
    if (Number.isNaN(b)) return null;
    const result = round2(applyOp(prev, b, op));
    if (!Number.isFinite(result)) { fail(); return null; }
    setCurrent(String(result));
    setPrev(null);
    setOp(null);
    setOverwrite(true);
    return { expression: `${prev} ${op} ${b}`, result };
  };

  const clearAll = () => { setCurrent("0"); setPrev(null); setOp(null); setOverwrite(true); };
  const backspace = () => { if (overwrite) return; setCurrent(current.length <= 1 ? "0" : current.slice(0, -1)); };

  /** Handle a key press. Returns a history entry when "=" produced a result. */
  const press = (k: string): CalcEntry | null => {
    if (k === "C") { clearAll(); return null; }
    if (k === "⌫") { backspace(); return null; }
    if (k === "=") return equals();
    if (k === "+" || k === "-" || k === "×" || k === "÷") { chooseOp(k); return null; }
    inputDigit(k);
    return null;
  };

  /** The number on screen with any pending operation applied; never negative, NaN or infinite. */
  const value = (): number => {
    let v = Number(current);
    if (prev !== null && op) v = applyOp(prev, v, op);
    v = round2(v);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };

  const expression = prev !== null && op ? `${prev} ${op}` : "";
  return { current, expression, press, value, reset };
}
