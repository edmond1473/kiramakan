import { describe, expect, it } from "vitest";
import { allocateBill, centsToPlain, formatRM, parseRM, roundToTarget } from "../money";

describe("allocateBill", () => {
  it("用倍数摊 tax：小计 100、总额 116.60", () => {
    const items = [
      { id: "a", qty: 1, lineCents: 2500 },
      { id: "b", qty: 1, lineCents: 2500 },
      { id: "c", qty: 1, lineCents: 5000 },
    ];
    const shares = [
      { itemId: "a", personId: "ali", units: 1 },
      { itemId: "b", personId: "bob", units: 1 },
      { itemId: "c", personId: "me", units: 1 },
    ];
    const r = allocateBill(items, shares, 11660, "me");
    expect(r.factor).toBeCloseTo(1.166, 10);
    expect(r.people.get("ali")).toEqual({ preTax: 2500, owed: 2915 });
    expect(r.people.get("bob")).toEqual({ preTax: 2500, owed: 2915 });
    expect(r.people.get("me")).toEqual({ preTax: 5000, owed: 5830 });
    expect(r.unassigned).toEqual({ preTax: 0, owed: 0 });
  });

  it("加起来永远刚好等于总额（三个人平分一个 item）", () => {
    const items = [{ id: "x", qty: 1, lineCents: 1000 }];
    const shares = ["p1", "p2", "p3"].map((p) => ({ itemId: "x", personId: p, units: 1 }));
    const r = allocateBill(items, shares, 1166, "p1");
    const sum = [...r.people.values()].reduce((s, v) => s + v.owed, 0) + r.unassigned.owed;
    expect(sum).toBe(1166);
    const owed = [...r.people.values()].map((v) => v.owed).sort();
    expect(owed).toEqual([388, 389, 389]);
    // 同分时多出来的 cent 先给付钱的人吸收
    expect(r.people.get("p1")!.owed).toBe(389);
  });

  it("qty>1 的 item 按份数算，没人认领的份数留在「未分配」", () => {
    const items = [{ id: "teh", qty: 3, lineCents: 1050 }];
    const shares = [{ itemId: "teh", personId: "ali", units: 1 }];
    const r = allocateBill(items, shares, 1050, "me");
    expect(r.people.get("ali")!.preTax).toBe(350);
    expect(r.unassigned.preTax).toBe(700);
    expect(r.items.get("teh")!.unassignedCents).toBe(700);
  });

  it("2 份 roti 三个人一起分：超过 qty 就变成按人头平分", () => {
    const items = [{ id: "roti", qty: 2, lineCents: 600 }];
    const shares = ["a", "b", "c"].map((p) => ({ itemId: "roti", personId: p, units: 1 }));
    const r = allocateBill(items, shares, 600);
    expect([...r.people.values()].map((v) => v.preTax)).toEqual([200, 200, 200]);
    expect(r.items.get("roti")!.overClaimed).toBe(true);
  });

  it("有折扣时倍数小于 1", () => {
    const items = [
      { id: "a", qty: 1, lineCents: 2000 },
      { id: "b", qty: 1, lineCents: 3000 },
    ];
    const shares = [
      { itemId: "a", personId: "a", units: 1 },
      { itemId: "b", personId: "b", units: 1 },
    ];
    const r = allocateBill(items, shares, 4500);
    expect(r.people.get("a")!.owed).toBe(1800);
    expect(r.people.get("b")!.owed).toBe(2700);
  });

  it("没有 item 的单：全部算未分配，不会除以零", () => {
    const r = allocateBill([], [], 5000);
    expect(r.factor).toBe(0);
    expect(r.unassigned.owed).toBe(5000);
    expect(r.people.size).toBe(0);
  });

  it("随机测试：任何组合加起来都等于总额", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let t = 0; t < 300; t++) {
      const n = 1 + Math.floor(rnd() * 8);
      const items = Array.from({ length: n }, (_, i) => ({
        id: `i${i}`,
        qty: 1 + Math.floor(rnd() * 3),
        lineCents: 100 + Math.floor(rnd() * 5000),
      }));
      const people = ["a", "b", "c", "d", "e"];
      const shares = items.flatMap((it) =>
        people.filter(() => rnd() < 0.4).map((p) => ({ itemId: it.id, personId: p, units: 1 + Math.floor(rnd() * 2) })),
      );
      const sub = items.reduce((s, i) => s + i.lineCents, 0);
      const total = Math.round(sub * (1 + rnd() * 0.25));
      const r = allocateBill(items, shares, total, "a");
      const sumOwed = [...r.people.values()].reduce((s, v) => s + v.owed, 0) + r.unassigned.owed;
      const sumPre = [...r.people.values()].reduce((s, v) => s + v.preTax, 0) + r.unassigned.preTax;
      expect(sumOwed).toBe(total);
      expect(sumPre).toBe(sub);
    }
  });
});

describe("roundToTarget", () => {
  it("同分时按传入顺序给", () => {
    const r = roundToTarget(
      [
        { key: "x", raw: 1.5 },
        { key: "y", raw: 1.5 },
      ],
      3,
    );
    expect(r.get("x")).toBe(2);
    expect(r.get("y")).toBe(1);
  });
});

describe("格式", () => {
  it("parseRM", () => {
    expect(parseRM("29.15")).toBe(2915);
    expect(parseRM("RM 1,234.5")).toBe(123450);
    expect(parseRM("-3")).toBe(-300);
    expect(parseRM(".5")).toBe(50);
    expect(parseRM("abc")).toBeNull();
    expect(parseRM("1.234")).toBeNull();
  });
  it("formatRM / centsToPlain", () => {
    expect(formatRM(123450)).toBe("RM 1,234.50");
    expect(formatRM(-415)).toBe("−RM 4.15");
    expect(centsToPlain(2915)).toBe("29.15");
    expect(centsToPlain(5)).toBe("0.05");
  });
});
