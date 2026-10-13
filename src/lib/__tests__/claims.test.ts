import { describe, expect, it } from "vitest";
import { matchClaims, type OpenClaim } from "../claims";

const c = (id: string, amountCents: number, date = "2026-10-13"): OpenClaim => ({ id, amountCents, date });

describe("matchClaims", () => {
  it("金额一样 → 那一笔", () => {
    expect(matchClaims([c("a", 1500), c("b", 2000)], 2000, "2026-10-13")).toEqual(["b"]);
  });

  it("差几仙、或凑整数多给不到 RM 1 → 也算那一笔", () => {
    expect(matchClaims([c("a", 1980)], 1978, "2026-10-13")).toEqual(["a"]);
    expect(matchClaims([c("a", 1980)], 2000, "2026-10-13")).toEqual(["a"]);
    expect(matchClaims([c("a", 1980)], 2100, "2026-10-13")).toEqual([]);
    expect(matchClaims([c("a", 1980)], 1900, "2026-10-13")).toEqual([]);
  });

  it("几笔一起转（金额 = 加起来）→ 全部", () => {
    expect(matchClaims([c("a", 1500, "2026-10-12"), c("b", 2000)], 3500, "2026-10-13")).toEqual(["a", "b"]);
  });

  it("转账那天之后才按的不算", () => {
    expect(matchClaims([c("a", 2000, "2026-10-14")], 2000, "2026-10-13")).toEqual([]);
  });

  it("金额最接近的优先", () => {
    expect(matchClaims([c("a", 1950), c("b", 2000)], 2000, "2026-10-13")).toEqual(["b"]);
  });

  it("都对不上 → 空的（照平常的规则处理）", () => {
    expect(matchClaims([], 2000, "2026-10-13")).toEqual([]);
    expect(matchClaims([c("a", 1500), c("b", 2000)], 5000, "2026-10-13")).toEqual([]);
  });
});
