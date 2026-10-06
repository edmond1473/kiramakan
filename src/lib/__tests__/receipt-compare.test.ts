import { describe, expect, it } from "vitest";
import { alignItems, balanceDiff, crossCheck, isBalanced, similarName, type ReadResult } from "../receipt-compare";

const base = (over: Partial<ReadResult>): ReadResult => ({
  provider: "gemini",
  label: "Gemini",
  model: "m",
  merchant: "Restoran",
  date: null,
  items: [],
  charges: [],
  printedSubtotalCents: null,
  totalCents: 0,
  notes: null,
  ...over,
});

const goodItems = [
  { name: "Nasi Lemak Ayam Goreng", qty: 1, lineCents: 1290 },
  { name: "Mee Goreng Mamak", qty: 1, lineCents: 950 },
  { name: "Roti Canai", qty: 2, lineCents: 360 },
  { name: "Teh Ais", qty: 3, lineCents: 1050 },
  { name: "Milo Dinosaur", qty: 1, lineCents: 690 },
  { name: "Sotong Goreng Tepung", qty: 1, lineCents: 1800 },
];
const goodCharges = [
  { label: "Service Charge 10%", amountCents: 614 },
  { label: "SST 6%", amountCents: 405 },
  { label: "Rounding", amountCents: 1 },
];
const gemini = base({ items: goodItems, charges: goodCharges, printedSubtotalCents: 6140, totalCents: 7160 });
// DeepSeek：Milo 读错、漏了 Roti、名字缩写、没读到 rounding
const deepseek = base({
  provider: "deepseek",
  label: "DeepSeek",
  items: [
    { name: "NASI LEMAK AYAM GRG", qty: 1, lineCents: 1290 },
    { name: "Mee Goreng Mamak", qty: 1, lineCents: 950 },
    { name: "Teh Ais", qty: 3, lineCents: 1050 },
    { name: "Milo Dinosaur", qty: 1, lineCents: 650 },
    { name: "SOTONG GRG TEPUNG", qty: 1, lineCents: 1800 },
  ],
  charges: goodCharges.slice(0, 2),
  printedSubtotalCents: 6140,
  totalCents: 7160,
});

describe("算不算得通", () => {
  it("item + charges = 总额", () => {
    expect(balanceDiff(gemini)).toBe(0);
    expect(isBalanced(gemini)).toBe(true);
    expect(isBalanced(deepseek)).toBe(false);
  });
});

describe("名字比对", () => {
  it("缩写、大小写当作同一个", () => {
    expect(similarName("Sotong Goreng Tepung", "SOTONG GRG TEPUNG")).toBe(true);
    expect(similarName("Teh Ais", "teh ais")).toBe(true);
    expect(similarName("Milo Dinosaur", "Roti Canai")).toBe(false);
    expect(similarName("海南鸡饭", "海南鸡饭（大）")).toBe(true);
  });
});

describe("对齐 item", () => {
  it("找出读错的金额和漏掉的 item", () => {
    const { notes, extra } = alignItems(gemini.items, deepseek.items, "Gemini", "DeepSeek");
    expect(notes[0]).toBeNull();
    expect(notes[2]).toBe("只有 Gemini 读到这个"); // Roti
    expect(notes[4]).toBe("DeepSeek 读成 RM 6.50"); // Milo
    expect(notes[5]).toBeNull(); // Sotong 名字缩写但金额一样
    expect(extra).toEqual([]);
  });

  it("另一个 AI 多读到的 item 会列出来", () => {
    const { extra } = alignItems(deepseek.items, gemini.items, "DeepSeek", "Gemini");
    expect(extra.map((e) => e.name)).toEqual(["Roti Canai"]);
  });
});

describe("crossCheck", () => {
  const order = ["gemini", "deepseek", "openai"] as const;

  it("两个一样 → match", () => {
    const r = crossCheck(
      [
        { provider: "gemini", label: "Gemini", ok: true, result: gemini },
        { provider: "deepseek", label: "DeepSeek", ok: true, result: { ...gemini, provider: "deepseek", label: "DeepSeek" } },
      ],
      [...order],
    )!;
    expect(r.check.status).toBe("match");
    expect(r.check.itemNotes.every((n) => n === null)).toBe(true);
  });

  it("不一样 → 选加起来对得上总额的那个", () => {
    const r = crossCheck(
      [
        { provider: "deepseek", label: "DeepSeek", ok: true, result: deepseek },
        { provider: "gemini", label: "Gemini", ok: true, result: gemini },
      ],
      [...order],
    )!;
    expect(r.check.status).toBe("picked");
    expect(r.chosen.provider).toBe("gemini");
    expect(r.check.itemNotes.filter(Boolean).length).toBe(2);
  });

  it("就算排第一的读错，也会选对得上的那个", () => {
    const badGemini = { ...deepseek, provider: "gemini" as const, label: "Gemini" };
    const goodDeepseek = { ...gemini, provider: "deepseek" as const, label: "DeepSeek" };
    const r = crossCheck(
      [
        { provider: "gemini", label: "Gemini", ok: true, result: badGemini },
        { provider: "deepseek", label: "DeepSeek", ok: true, result: goodDeepseek },
      ],
      [...order],
    )!;
    expect(r.chosen.provider).toBe("deepseek");
    expect(r.check.extraItems).toEqual([]);
    expect(r.check.itemNotes).toContain("Gemini 读成 RM 6.50");
  });

  it("总额读得不一样会列出来", () => {
    const other = { ...gemini, provider: "deepseek" as const, label: "DeepSeek", totalCents: 6160 };
    const r = crossCheck(
      [
        { provider: "gemini", label: "Gemini", ok: true, result: gemini },
        { provider: "deepseek", label: "DeepSeek", ok: true, result: other },
      ],
      [...order],
    )!;
    expect(r.chosen.provider).toBe("gemini");
    expect(r.check.totals).toEqual([
      { label: "Gemini", totalCents: 7160 },
      { label: "DeepSeek", totalCents: 6160 },
    ]);
  });

  it("一个失败 → single", () => {
    const r = crossCheck(
      [
        { provider: "gemini", label: "Gemini", ok: true, result: gemini },
        { provider: "deepseek", label: "DeepSeek", ok: false, error: "超时" },
      ],
      [...order],
    )!;
    expect(r.check.status).toBe("single");
    expect(r.check.message).toContain("DeepSeek：超时");
  });

  it("全部失败 → null", () => {
    expect(crossCheck([{ provider: "gemini", label: "Gemini", ok: false, error: "x" }], [...order])).toBeNull();
  });
});
