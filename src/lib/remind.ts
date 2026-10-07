// 提醒的内容（谁还没还、少给 tax、没人认领的 item）和通知文字。纯函数，方便测试。

import type { BillPayStatus, PaymentVerdict } from "./ledger";
import { formatRM } from "./money";

export interface DebtorBill {
  billId: string;
  title: string;
  billDate: string;
  remaining: number;
  status: BillPayStatus;
  /** 他在这一餐吃的 item，例如「Nasi Lemak」「Pizza 1/3」 */
  items: string[];
}

export interface DebtorReminder {
  personId: string;
  name: string;
  owed: number;
  bills: DebtorBill[];
  /** 少给 tax 还差的钱（0 = 没有） */
  forgotTax: number;
}

export interface UnclaimedReminder {
  billId: string;
  title: string;
  billDate: string;
  /** 没人认领的部分（含 tax） */
  owed: number;
  items: { name: string; cents: number }[];
  /** 有份吃、但还没点自己吃什么的人 */
  notPicked: string[];
}

export interface ReminderData {
  debtors: DebtorReminder[];
  unclaimed: UnclaimedReminder[];
  /** TNG 进账还不知道是谁的笔数 */
  pendingIncoming: number;
  totalOwed: number;
}

export interface NoticeText {
  title: string;
  body: string;
}

export function hasAnything(d: ReminderData): boolean {
  return d.debtors.length > 0 || d.unclaimed.length > 0 || d.pendingIncoming > 0;
}

/** 每隔一天的提醒；没有东西要提醒就返回 null */
export function reminderText(d: ReminderData): NoticeText | null {
  if (!hasAnything(d)) return null;
  const lines: string[] = [];

  if (d.debtors.length > 0) {
    const shown = d.debtors.slice(0, 3).map((x) => `${x.name} ${formatRM(x.owed)}${x.forgotTax > 0 ? "（少给 tax）" : ""}`);
    const more = d.debtors.length > 3 ? ` 等 ${d.debtors.length} 人` : "";
    lines.push(`${shown.join("、")}${more}`);
  }
  const taxShort = d.debtors.filter((x) => x.forgotTax > 0);
  if (taxShort.length > 0 && d.debtors.length > 3) {
    lines.push(`少给 tax：${taxShort.map((x) => `${x.name} 差 ${formatRM(x.forgotTax)}`).join("、")}`);
  }
  if (d.unclaimed.length > 0) {
    const n = d.unclaimed.reduce((s, u) => s + u.items.length, 0);
    const cents = d.unclaimed.reduce((s, u) => s + u.owed, 0);
    lines.push(`${n} 个 item 没人认领（${formatRM(cents)}）`);
  }
  if (d.pendingIncoming > 0) lines.push(`${d.pendingIncoming} 笔 TNG 进账不知道是谁转的`);

  const title =
    d.debtors.length > 0
      ? `${d.debtors.length} 个人还欠你 ${formatRM(d.totalOwed)}`
      : d.unclaimed.length > 0
        ? "有 item 还没人认领"
        : "有 TNG 进账要你确认";
  return { title, body: lines.join("\n") };
}

/** 自动记好一笔之后的通知 */
export function recordedText(name: string, amount: number, verdict: PaymentVerdict): NoticeText {
  switch (verdict.kind) {
    case "settles_all":
      return { title: `${name} 还清了 ✓`, body: `收到 ${formatRM(amount)}，已经自动记好。` };
    case "forgot_tax":
      return {
        title: `${name} 少给了 tax`,
        body: `转了 ${formatRM(amount)}，还差 ${formatRM(verdict.short)}（tax / service charge）。已经先记好收到的部分。`,
      };
    case "settles_some":
      return {
        title: `${name} 还了 ${formatRM(amount)}`,
        body: `还清了 ${verdict.bills} 餐，还欠 ${formatRM(verdict.remaining)}。已经自动记好。`,
      };
    case "partial":
      return { title: `${name} 还了 ${formatRM(amount)}`, body: `还欠 ${formatRM(verdict.remaining)}。已经自动记好。` };
    case "overpay":
      return { title: `${name} 还清了 ✓`, body: `多给了 ${formatRM(verdict.credit)}，记成 credit，下次自动扣。` };
    case "nothing_owed":
      return { title: `${name} 转了 ${formatRM(amount)}`, body: "记成 credit，下次自动扣。" };
  }
}

export type PendingReason = "unknown_sender" | "tied" | "overpay" | "no_debt" | "unsure" | "undone";

/** 要你按一下确认的进账 */
export function pendingText(input: {
  reason: PendingReason;
  amount: number;
  sender: string | null;
  personName: string | null;
  owed: number;
}): NoticeText {
  const { amount, sender, personName, owed } = input;
  switch (input.reason) {
    case "overpay":
      return {
        title: `${personName} 转了 ${formatRM(amount)}`,
        body: `他只欠你 ${formatRM(owed)}。按这里选：只记还清的部分，还是全部记。`,
      };
    case "no_debt":
      return {
        title: `${personName} 转了 ${formatRM(amount)}`,
        body: "他目前没有欠你钱，可能是别的事。按这里选要不要记。",
      };
    default:
      return {
        title: `收到 ${formatRM(amount)}，是谁转的？`,
        body: `${sender ? `TNG 显示「${sender}」。` : ""}按这里选是哪个朋友，下次就会自动认得。`,
      };
  }
}
