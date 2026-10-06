// 欠款账本：每一对 (欠钱的人 → 收钱的人) 一本账，用「余额」而不是一餐一餐打勾。
// 付款按 FIFO 先还最早的一餐；忘了给 tax 的情况会被认出来。

import { centsToPlain, formatRM } from "./money";

export const DEFAULT_TOLERANCE_CENTS = 5;

export interface Charge {
  billId: string;
  billDate: string; // YYYY-MM-DD
  createdAt: string; // ISO，用来排同一天的先后
  owed: number;
  preTax: number;
}

export interface PaymentLite {
  id: string;
  amount: number;
  paidAt: string; // ISO
}

export type BillPayStatus = "paid" | "forgot_tax" | "partial" | "unpaid";

export interface ChargeState extends Charge {
  paid: number;
  remaining: number;
  status: BillPayStatus;
}

export interface PairLedger {
  charges: ChargeState[]; // 按 FIFO 顺序
  totalOwed: number;
  totalPaid: number;
  balance: number; // >0 还欠；<0 多给了（credit）
}

export function sortCharges(charges: Charge[]): Charge[] {
  return [...charges].sort((a, b) =>
    a.billDate !== b.billDate
      ? a.billDate.localeCompare(b.billDate)
      : a.createdAt.localeCompare(b.createdAt),
  );
}

export function chargeStatus(
  owed: number,
  paid: number,
  preTax: number,
  tol = DEFAULT_TOLERANCE_CENTS,
): BillPayStatus {
  if (owed <= 0 || paid >= owed - tol) return "paid";
  if (paid <= 0) return "unpaid";
  if (Math.abs(paid - preTax) <= tol && preTax < owed - tol) return "forgot_tax";
  return "partial";
}

export function buildLedger(
  charges: Charge[],
  payments: PaymentLite[],
  tol = DEFAULT_TOLERANCE_CENTS,
): PairLedger {
  const ordered = sortCharges(charges.filter((c) => c.owed > 0));
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  let pool = totalPaid;
  const states: ChargeState[] = ordered.map((c) => {
    const paid = Math.max(0, Math.min(pool, c.owed));
    pool -= paid;
    return {
      ...c,
      paid,
      remaining: c.owed - paid,
      status: chargeStatus(c.owed, paid, c.preTax, tol),
    };
  });
  const totalOwed = ordered.reduce((s, c) => s + c.owed, 0);
  return { charges: states, totalOwed, totalPaid, balance: totalOwed - totalPaid };
}

export type PaymentVerdict =
  | { kind: "settles_all"; message: string }
  | { kind: "overpay"; credit: number; message: string }
  | { kind: "forgot_tax"; short: number; message: string }
  | { kind: "settles_some"; bills: number; remaining: number; message: string }
  | { kind: "partial"; remaining: number; message: string }
  | { kind: "nothing_owed"; message: string };

/**
 * 记一笔付款之前（或 Phase 2 自动抓到进账时）判断这笔钱代表什么。
 * ledger 是记这笔之前的账。
 */
export function classifyPayment(
  amount: number,
  ledger: PairLedger,
  tol = DEFAULT_TOLERANCE_CENTS,
): PaymentVerdict {
  const outstanding = ledger.charges.filter((c) => c.remaining > 0);
  const totalOutstanding = Math.max(0, ledger.balance);

  if (totalOutstanding <= tol) {
    return {
      kind: "nothing_owed",
      message: `目前没有欠款，这 ${formatRM(amount)} 会记成 credit，下次自动扣`,
    };
  }
  if (Math.abs(amount - totalOutstanding) <= tol) {
    return { kind: "settles_all", message: "刚好付清 ✓" };
  }
  if (amount > totalOutstanding + tol) {
    const credit = amount - totalOutstanding;
    return {
      kind: "overpay",
      credit,
      message: `付清了，还多给 ${formatRM(credit)}（记成 credit，下次自动扣）`,
    };
  }

  // 「没加 tax」的金额：还没开始还的单算 preTax；还了一部分的单，算还差的 item 部分
  const preTaxOutstanding = outstanding.reduce(
    (s, c) => s + (c.paid === 0 ? c.preTax : Math.max(0, c.preTax - c.paid)),
    0,
  );
  if (
    Math.abs(amount - preTaxOutstanding) <= tol &&
    preTaxOutstanding < totalOutstanding - tol
  ) {
    const short = totalOutstanding - amount;
    return {
      kind: "forgot_tax",
      short,
      message: `看起来忘了给 tax / service charge：还差 ${formatRM(short)}`,
    };
  }

  // 刚好还清最早的几餐
  let prefix = 0;
  let prefixPre = 0;
  for (let i = 0; i < outstanding.length; i++) {
    const c = outstanding[i];
    prefix += c.remaining;
    prefixPre += c.paid === 0 ? c.preTax : Math.max(0, c.preTax - c.paid);
    if (i < outstanding.length - 1 && Math.abs(amount - prefix) <= tol) {
      const remaining = totalOutstanding - amount;
      return {
        kind: "settles_some",
        bills: i + 1,
        remaining,
        message: `还清了 ${i + 1} 餐，还欠 ${formatRM(remaining)}`,
      };
    }
    if (
      i < outstanding.length - 1 &&
      Math.abs(amount - prefixPre) <= tol &&
      prefixPre < prefix - tol
    ) {
      const short = prefix - amount;
      return {
        kind: "forgot_tax",
        short,
        message: `看起来最早 ${i + 1} 餐忘了给 tax：那 ${i + 1} 餐还差 ${formatRM(short)}，总共还欠 ${formatRM(totalOutstanding - amount)}`,
      };
    }
  }

  const remaining = totalOutstanding - amount;
  return { kind: "partial", remaining, message: `还欠 ${formatRM(remaining)}` };
}

export function statusLabel(c: { status: BillPayStatus; remaining: number; preTax: number; paid: number }): string {
  switch (c.status) {
    case "paid":
      return "已付";
    case "forgot_tax":
      return `忘了 tax，还差 RM ${centsToPlain(c.remaining)}`;
    case "partial":
      return `还差 RM ${centsToPlain(c.remaining)}`;
    case "unpaid":
      return "未付";
  }
}

/** 余额很小（≤ 容许误差）就当作已经结清 */
export function isSettled(balance: number, tol = DEFAULT_TOLERANCE_CENTS): boolean {
  return Math.abs(balance) <= tol;
}
