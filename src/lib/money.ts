// 金钱计算引擎：全部用 integer cents，AI 不参与任何计算。
//
// 核心想法：tax / service charge / rounding / 折扣 不用知道税率，
// 用「receipt 总额 ÷ item 小计」得出一个倍数，每人的 item 乘这个倍数。

export type PersonId = string;

export interface ItemInput {
  id: string;
  qty: number; // 印在 receipt 上的数量
  lineCents: number; // 这一行的金额（已经是 qty × 单价）
}

export interface ShareInput {
  itemId: string;
  personId: PersonId;
  units: number; // 份数：qty=1 的 item 代表「几个人分」；qty>1 代表「拿了几份」
}

export interface PersonAmount {
  preTax: number; // 只算 item 的金额（没加 tax）
  owed: number; // 加了 tax / service charge 之后要付的
}

export interface ItemSplit {
  itemId: string;
  denom: number; // 分母（份数）
  claimedUnits: number;
  unassignedCents: number; // 还没人认领的部分（未加 tax，四舍五入到 cent，仅供显示）
  overClaimed: boolean; // qty>1 但认领的份数比 qty 多
}

export interface Allocation {
  itemsSubtotal: number;
  totalCents: number;
  factor: number; // total / itemsSubtotal
  people: Map<PersonId, PersonAmount>;
  unassigned: PersonAmount; // 没人认领的部分
  items: Map<string, ItemSplit>;
}

const UNASSIGNED = "__unassigned__";

/** 一个 item 的数量是否当作「可数的份数」 */
export function countableQty(qty: number): number {
  return Number.isInteger(qty) && qty >= 1 ? qty : 1;
}

/**
 * Largest remainder method：把带小数的金额四舍五入成 cents，同时保证加起来刚好等于 target。
 * order 决定同分时谁先拿到多出来的 1 cent。
 */
export function roundToTarget(
  entries: { key: string; raw: number }[],
  target: number,
): Map<string, number> {
  const result = new Map<string, number>();
  if (entries.length === 0) return result;
  const EPS = 1e-7;
  const floors = entries.map((e) => {
    const f = Math.floor(e.raw + EPS);
    return { key: e.key, floor: f, rem: e.raw - f };
  });
  let remaining = target - floors.reduce((s, f) => s + f.floor, 0);
  // 余数大的先拿；同分时保持传入顺序（稳定排序）
  const byRemDesc = floors
    .map((f, i) => ({ ...f, i }))
    .sort((a, b) => (Math.abs(b.rem - a.rem) > EPS ? b.rem - a.rem : a.i - b.i));
  for (const f of floors) result.set(f.key, f.floor);
  let idx = 0;
  while (remaining > 0 && byRemDesc.length > 0) {
    const k = byRemDesc[idx % byRemDesc.length].key;
    result.set(k, (result.get(k) ?? 0) + 1);
    remaining--;
    idx++;
  }
  // 理论上不会发生（浮点误差才会），保险起见从余数最小的扣回去
  idx = byRemDesc.length - 1;
  while (remaining < 0 && byRemDesc.length > 0) {
    const k = byRemDesc[((idx % byRemDesc.length) + byRemDesc.length) % byRemDesc.length].key;
    result.set(k, (result.get(k) ?? 0) - 1);
    remaining++;
    idx--;
  }
  return result;
}

/**
 * 计算一张单里每个人的份额。
 * @param payerId 付钱的人；同分时 rounding 多出来的 1 cent 优先给付钱的人吸收。
 */
export function allocateBill(
  items: ItemInput[],
  shares: ShareInput[],
  totalCents: number,
  payerId?: PersonId,
): Allocation {
  const itemsSubtotal = items.reduce((s, it) => s + it.lineCents, 0);
  const factor = itemsSubtotal !== 0 ? totalCents / itemsSubtotal : 0;

  const sharesByItem = new Map<string, ShareInput[]>();
  for (const sh of shares) {
    if (!(sh.units > 0)) continue;
    const list = sharesByItem.get(sh.itemId) ?? [];
    list.push(sh);
    sharesByItem.set(sh.itemId, list);
  }

  const rawPreTax = new Map<string, number>();
  const order: string[] = [];
  const touch = (k: string) => {
    if (!rawPreTax.has(k)) {
      rawPreTax.set(k, 0);
      order.push(k);
    }
  };
  touch(UNASSIGNED);
  if (payerId) touch(payerId);

  const itemSplits = new Map<string, ItemSplit>();
  for (const it of items) {
    const list = sharesByItem.get(it.id) ?? [];
    const claimed = list.reduce((s, x) => s + x.units, 0);
    const q = countableQty(it.qty);
    const denom = q > 1 ? Math.max(q, claimed) : Math.max(claimed, 1);
    let assigned = 0;
    for (const sh of list) {
      touch(sh.personId);
      const part = (it.lineCents * sh.units) / denom;
      rawPreTax.set(sh.personId, (rawPreTax.get(sh.personId) ?? 0) + part);
      assigned += part;
    }
    const unassignedPart = it.lineCents - assigned;
    rawPreTax.set(UNASSIGNED, (rawPreTax.get(UNASSIGNED) ?? 0) + unassignedPart);
    itemSplits.set(it.id, {
      itemId: it.id,
      denom,
      claimedUnits: claimed,
      unassignedCents: Math.round(unassignedPart),
      overClaimed: q > 1 && claimed > q,
    });
  }

  // 同分时的顺序：未分配 → 付钱的人 → 其他人
  const entriesPre = order.map((k) => ({ key: k, raw: rawPreTax.get(k) ?? 0 }));
  const preTax = roundToTarget(entriesPre, itemsSubtotal);
  const entriesOwed = order.map((k) => ({ key: k, raw: (rawPreTax.get(k) ?? 0) * factor }));
  const owed = roundToTarget(entriesOwed, itemsSubtotal !== 0 ? totalCents : 0);

  const people = new Map<PersonId, PersonAmount>();
  for (const k of order) {
    if (k === UNASSIGNED) continue;
    people.set(k, { preTax: preTax.get(k) ?? 0, owed: owed.get(k) ?? 0 });
  }
  // 没有 item 的单：全部算未分配
  const unassigned: PersonAmount =
    itemsSubtotal !== 0
      ? { preTax: preTax.get(UNASSIGNED) ?? 0, owed: owed.get(UNASSIGNED) ?? 0 }
      : { preTax: 0, owed: totalCents };

  return { itemsSubtotal, totalCents, factor, people, unassigned, items: itemSplits };
}

/** RM 字符串 → cents（"29.15" / "RM 1,234.5" / "-3"） */
export function parseRM(input: string): number | null {
  const s = input.replace(/rm/gi, "").replace(/[,\s]/g, "").trim();
  if (!/^-?\d+(\.\d{0,2})?$/.test(s) && !/^-?\.\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** cents → "29.15" */
export function centsToPlain(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

/** cents → "RM 1,234.50" */
export function formatRM(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100).toLocaleString("en-MY");
  const s = `RM ${whole}.${String(abs % 100).padStart(2, "0")}`;
  return neg ? `−${s}` : s;
}

/** 浮点 RM（例如 OCR 给的 12.9）→ cents */
export function rmToCents(n: number): number {
  return Math.round(n * 100);
}
