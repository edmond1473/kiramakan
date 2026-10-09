import { describe, expect, it } from "vitest";
import { voiceToBill, type VoiceRaw } from "../voice";

const raw = (over: Partial<VoiceRaw>): VoiceRaw => ({
  transcript: "",
  title: "",
  items: [],
  charges: [],
  hasTax: false,
  total: 0,
  notes: "",
  ...over,
});

describe("voiceToBill", () => {
  it("每个的价钱要乘份数，整行的价钱不用", () => {
    const b = voiceToBill(
      raw({
        items: [
          { name: "Teh Tarik", qty: 3, amount: 3, amountIsEach: true },
          { name: "Nasi Lemak", qty: 2, amount: 24, amountIsEach: false },
        ],
      }),
    );
    expect(b.items.map((i) => i.lineCents)).toEqual([900, 2400]);
    expect(b.totalCents).toBe(3300);
  });

  it("service charge 按小计算，SST 按小计 + service charge 算", () => {
    const b = voiceToBill(
      raw({
        items: [{ name: "Chicken Rice", qty: 1, amount: 100, amountIsEach: false }],
        charges: [
          { label: "SST 6%", percent: 6, amount: 0 },
          { label: "Service Charge 10%", percent: 10, amount: 0 },
        ],
      }),
    );
    expect(b.charges).toEqual([
      { label: "Service Charge 10%", amountCents: 1000 },
      { label: "SST 6%", amountCents: 660 },
    ]);
    expect(b.totalCents).toBe(11660);
  });

  it("有说总额就用说的总额（对不上的话核对画面会提醒）", () => {
    const b = voiceToBill(
      raw({
        items: [{ name: "A", qty: 1, amount: 10, amountIsEach: false }],
        charges: [{ label: "SST 6%", percent: 6, amount: 0 }],
        total: 10.65,
      }),
    );
    expect(b.charges).toEqual([{ label: "SST 6%", amountCents: 60 }]);
    expect(b.totalCents).toBe(1065);
  });

  it("只说有 tax 和总额：差额就是 tax", () => {
    const b = voiceToBill(
      raw({ items: [{ name: "Mee", qty: 1, amount: 80, amountIsEach: false }], hasTax: true, total: 92.4 }),
    );
    expect(b.charges).toEqual([{ label: "Tax", amountCents: 1240 }]);
    expect(b.totalCents).toBe(9240);
    expect(b.notes).toBeNull();
  });

  it("只说有 tax、没说总额：提醒自己补", () => {
    const b = voiceToBill(raw({ items: [{ name: "Mee", qty: 1, amount: 8, amountIsEach: false }], hasTax: true }));
    expect(b.charges).toEqual([]);
    expect(b.totalCents).toBe(800);
    expect(b.notes).toContain("tax");
  });

  it("折扣一定是负数", () => {
    const b = voiceToBill(
      raw({
        items: [{ name: "A", qty: 1, amount: 50, amountIsEach: false }],
        charges: [
          { label: "Discount 10%", percent: 10, amount: 0 },
          { label: "Voucher", percent: 0, amount: 5 },
        ],
      }),
    );
    expect(b.charges).toEqual([
      { label: "Discount 10%", amountCents: -500 },
      { label: "Voucher", amountCents: -500 },
    ]);
    expect(b.totalCents).toBe(4000);
  });

  it("没说价钱的 item 留着（0），让人在核对画面补", () => {
    const b = voiceToBill(raw({ items: [{ name: "Roti", qty: 2, amount: 0, amountIsEach: true }] }));
    expect(b.items).toEqual([{ name: "Roti", qty: 2, lineCents: 0 }]);
  });
});
