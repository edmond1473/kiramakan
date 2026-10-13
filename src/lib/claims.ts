// 朋友按「去付款」= 先当作他付了（待核对）。真的钱进来的时候（TNG 交易记录 PDF、TNG 通知、你手动记）用这里对。
import { DEFAULT_TOLERANCE_CENTS } from "./ledger";

export interface OpenClaim {
  id: string;
  amountCents: number;
  /** 按的那一天（马来西亚时间 YYYY-MM-DD） */
  date: string;
}

/** 凑整数很常见（RM 19.80 → 转 RM 20）：多给不到 RM 1 也当作是同一笔 */
const ROUND_UP_CENTS = 100;

/**
 * 一笔真的转账对上哪几笔待核对（只看转账那天或之前按的）：
 * 金额对上其中一笔（或多给不到 RM 1）→ 那一笔；对上全部加起来 → 全部；都对不上 → 空的。
 */
export function matchClaims(claims: OpenClaim[], amountCents: number, date: string, tol = DEFAULT_TOLERANCE_CENTS): string[] {
  const eligible = claims.filter((c) => c.date <= date);
  const single = eligible
    .map((c) => ({ c, diff: amountCents - c.amountCents }))
    .filter(({ diff }) => diff >= -tol && diff < ROUND_UP_CENTS)
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
  if (single.length) return [single[0].c.id];
  if (eligible.length > 1) {
    const sum = eligible.reduce((s, c) => s + c.amountCents, 0);
    if (Math.abs(sum - amountCents) <= tol) return eligible.map((c) => c.id);
  }
  return [];
}
