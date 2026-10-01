import { test } from "node:test";
import assert from "node:assert/strict";
import { evalExpr, money, monthsBetween, addDaysISO, compact } from "../src/format.ts";

test("evalExpr basics", () => {
  assert.equal(evalExpr("120+45*2"), 210);
  assert.equal(evalExpr("(10+5)×2"), 30);
  assert.equal(evalExpr("100/3"), 33.33);
  assert.equal(evalExpr("-5+10"), 5);
  assert.equal(evalExpr("1,200+300"), 1500);
  assert.equal(evalExpr("12.5*2"), 25);
});
test("evalExpr rejects junk", () => {
  for (const bad of ["", "abc", "1+", "(1+2", "1/0", "2**3", "1..2", "alert(1)", "1+2)"]) assert.equal(evalExpr(bad), null, bad);
});
test("money formatting", () => {
  assert.equal(money(1234567, "INR"), "₹12,34,567");
  assert.equal(money(999.5, "INR"), "₹999.50");
  assert.equal(money(-250, "USD"), "-$250");
  assert.equal(money(1234567, "USD"), "$1,234,567");
  assert.equal(money(500, "INR", { sign: true }), "+₹500");
});
test("dates", () => {
  assert.equal(addDaysISO("2026-02-28", 1), "2026-03-01");
  assert.equal(addDaysISO("2026-01-01", -1), "2025-12-31");
  assert.equal(monthsBetween("2026-10-02", "2027-04-02"), 7);
  assert.equal(compact(125000), "1.3L");
  assert.equal(compact(4500), "4.5k");
});
