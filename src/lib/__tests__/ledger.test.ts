import { describe, expect, it } from "vitest";
import { buildLedger, classifyPayment, type Charge } from "../ledger";

const bill1: Charge = { billId: "b1", billDate: "2026-10-01", createdAt: "2026-10-01T12:00:00Z", owed: 2915, preTax: 2500 };
const bill2: Charge = { billId: "b2", billDate: "2026-10-03", createdAt: "2026-10-03T12:00:00Z", owed: 1200, preTax: 1000 };
const pay = (amount: number, i = 1) => ({ id: `p${i}`, amount, paidAt: `2026-10-0${i}T13:00:00Z` });

describe("buildLedger", () => {
  it("只给了 item 的钱 → 标「忘了 tax」", () => {
    const l = buildLedger([bill1], [pay(2500)]);
    expect(l.charges[0].status).toBe("forgot_tax");
    expect(l.charges[0].remaining).toBe(415);
    expect(l.balance).toBe(415);
  });

  it("FIFO：先还最早的一餐", () => {
    const l = buildLedger([bill2, bill1], [pay(3000)]);
    expect(l.charges.map((c) => c.billId)).toEqual(["b1", "b2"]);
    expect(l.charges[0].status).toBe("paid");
    expect(l.charges[1].paid).toBe(85);
    expect(l.charges[1].status).toBe("partial");
    expect(l.balance).toBe(1115);
  });

  it("差几仙（容许误差内）算已付", () => {
    const l = buildLedger([bill1], [pay(2912)]);
    expect(l.charges[0].status).toBe("paid");
  });

  it("多给了 → 余额是负数（credit）", () => {
    const l = buildLedger([bill1], [pay(3000)]);
    expect(l.balance).toBe(-85);
  });
});

describe("classifyPayment", () => {
  const before = buildLedger([bill1, bill2], []);

  it("刚好付清", () => {
    expect(classifyPayment(4115, before).kind).toBe("settles_all");
  });

  it("两餐都忘了 tax", () => {
    const v = classifyPayment(3500, before);
    expect(v.kind).toBe("forgot_tax");
    if (v.kind === "forgot_tax") expect(v.short).toBe(615);
  });

  it("只还了第一餐", () => {
    const v = classifyPayment(2915, before);
    expect(v.kind).toBe("settles_some");
    if (v.kind === "settles_some") expect(v.remaining).toBe(1200);
  });

  it("第一餐忘了 tax", () => {
    const v = classifyPayment(2500, before);
    expect(v.kind).toBe("forgot_tax");
    if (v.kind === "forgot_tax") expect(v.short).toBe(415);
  });

  it("多给了", () => {
    const v = classifyPayment(5000, before);
    expect(v.kind).toBe("overpay");
    if (v.kind === "overpay") expect(v.credit).toBe(885);
  });

  it("随便一个数目 → 还欠多少", () => {
    const v = classifyPayment(1000, before);
    expect(v.kind).toBe("partial");
    if (v.kind === "partial") expect(v.remaining).toBe(3115);
  });

  it("没有欠款", () => {
    expect(classifyPayment(1000, buildLedger([], [])).kind).toBe("nothing_owed");
  });

  it("之前忘了 tax，现在补 tax 的差额 → 付清", () => {
    const after = buildLedger([bill1], [pay(2500)]);
    expect(classifyPayment(415, after).kind).toBe("settles_all");
  });
});
