// receipt 草稿（核对画面用）与确定性检查，前后端共用
import { formatRM, parseRM, centsToPlain } from "./money";

export interface DraftItem {
  key: string;
  id?: string;
  name: string;
  qty: string;
  amount: string;
  /** 两个 AI 读得不一样时的提示，例如「DeepSeek 读成 RM 6.50」；改过这一行就清掉 */
  note?: string | null;
}

export interface DraftCharge {
  key: string;
  label: string;
  amount: string;
}

export interface Draft {
  title: string;
  date: string;
  items: DraftItem[];
  charges: DraftCharge[];
  total: string;
  printedSubtotalCents: number | null;
}

let seq = 0;
export const newKey = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

export function draftFromParts(input: {
  title: string;
  date: string;
  items: { id?: string; name: string; qty: number; lineCents: number }[];
  charges: { label: string; amountCents: number }[];
  totalCents: number;
  printedSubtotalCents: number | null;
  notes?: (string | null)[];
}): Draft {
  return {
    title: input.title,
    date: input.date,
    items: input.items.map((i, idx) => ({
      key: newKey(),
      id: i.id,
      name: i.name,
      qty: String(i.qty),
      amount: centsToPlain(i.lineCents),
      note: input.notes?.[idx] ?? null,
    })),
    charges: input.charges.map((c) => ({ key: newKey(), label: c.label, amount: centsToPlain(c.amountCents) })),
    total: input.totalCents > 0 ? centsToPlain(input.totalCents) : "",
    printedSubtotalCents: input.printedSubtotalCents,
  };
}

export interface ParsedDraft {
  items: { id?: string; name: string; qty: number; lineCents: number }[];
  charges: { label: string; amountCents: number }[];
  totalCents: number;
  itemsSum: number;
  chargesSum: number;
  /** item + charges − 总额；不是 0 就不能继续 */
  balanceDiff: number;
  balanced: boolean;
  /** 加起来对不上总额的错误（核对画面已经有专门的提示框，列错误时可以跳过它） */
  balanceError: string | null;
  errors: string[];
  warnings: string[];
}

export function parseDraft(d: Draft): ParsedDraft {
  const errors: string[] = [];
  const items = d.items
    .filter((i) => i.name.trim() || i.amount.trim())
    .map((i, idx) => {
      const lineCents = parseRM(i.amount);
      const qty = Number(i.qty || "1");
      if (!i.name.trim()) errors.push(`第 ${idx + 1} 个 item 没有名字`);
      if (lineCents === null) errors.push(`「${i.name || `第 ${idx + 1} 个 item`}」的金额看不懂`);
      if (!(qty > 0)) errors.push(`「${i.name || `第 ${idx + 1} 个 item`}」的数量要大过 0`);
      return { id: i.id, name: i.name.trim(), qty: qty > 0 ? qty : 1, lineCents: lineCents ?? 0 };
    });
  const charges = d.charges
    .filter((c) => c.label.trim() || c.amount.trim())
    .map((c) => {
      const amountCents = parseRM(c.amount);
      if (amountCents === null) errors.push(`「${c.label || "charge"}」的金额看不懂`);
      return { label: c.label.trim() || "Charge", amountCents: amountCents ?? 0 };
    });
  const totalCents = parseRM(d.total) ?? 0;
  if (totalCents <= 0) errors.push("请填总额（receipt 最后要付的数目）");
  if (items.length === 0) errors.push("最少要有一个 item");
  if (!d.title.trim()) errors.push("请填餐厅名字");
  const itemsSum = items.reduce((s, i) => s + i.lineCents, 0);
  const chargesSum = charges.reduce((s, c) => s + c.amountCents, 0);
  const balanceDiff = itemsSum + chargesSum - totalCents;
  const balanced = balanceDiff === 0;
  let balanceError: string | null = null;
  if (totalCents > 0 && items.length > 0 && !balanced) {
    balanceError = balanceMessage(itemsSum, chargesSum, totalCents);
    errors.push(balanceError);
  }
  return {
    items,
    charges,
    totalCents,
    itemsSum,
    chargesSum,
    balanceDiff,
    balanced,
    balanceError,
    errors,
    warnings: checkDraft(items, charges, d.printedSubtotalCents, totalCents),
  };
}

export function balanceMessage(itemsSum: number, chargesSum: number, totalCents: number): string {
  const diff = itemsSum + chargesSum - totalCents;
  return `item ${formatRM(itemsSum)} + charges ${formatRM(chargesSum)} = ${formatRM(itemsSum + chargesSum)}，跟总额 ${formatRM(totalCents)} ${diff > 0 ? "多了" : "少了"} ${formatRM(Math.abs(diff))}`;
}

/** item 加起来对不对得上 receipt 印的小计（加起来等不等于总额由 parseDraft 挡） */
export function checkDraft(
  items: { lineCents: number }[],
  _charges: { amountCents: number }[],
  printedSubtotalCents: number | null,
  totalCents: number,
): string[] {
  const w: string[] = [];
  const sum = items.reduce((s, i) => s + i.lineCents, 0);
  if (items.length === 0) w.push("没有读到任何 item，请手动加。");
  if (totalCents <= 0) w.push("没有读到总额，请手动填。");
  if (printedSubtotalCents != null && items.length > 0 && Math.abs(sum - printedSubtotalCents) > 1) {
    w.push(
      `item 加起来是 ${formatRM(sum)}，但 receipt 印的小计是 ${formatRM(printedSubtotalCents)}，可能漏了或读错 item。`,
    );
  }
  return w;
}

/** server 端也检查一次：item + charges 一定要等于总额 */
export function isBillBalanced(
  items: { lineCents: number }[],
  charges: { amountCents: number }[],
  totalCents: number,
): boolean {
  return items.reduce((s, i) => s + i.lineCents, 0) + charges.reduce((s, c) => s + c.amountCents, 0) === totalCents;
}
