// 测试用：用简单的描述组出一个 World（不用资料库）
import { allocateBill } from "../money";
import type { BillRow, ItemRow, PaymentRow, PersonRow, ShareRow, World } from "../server/world";

export interface FixtureBill {
  id: string;
  title?: string;
  date?: string;
  payer: string;
  total: number;
  items: { id: string; name: string; cents: number; qty?: number; eaters?: Record<string, number> }[];
  participants?: string[];
}

export function person(id: string, name: string, tngName: string | null = null, extra: Partial<PersonRow> = {}): PersonRow {
  return {
    id,
    name,
    tngName,
    phone: null,
    token: `tok-${id}`,
    isActive: true,
    userId: null,
    qrPayload: null,
    qrAmountEnabled: false,
    payPhone: null,
    ...extra,
  };
}

export function buildWorld(
  people: PersonRow[],
  bills: FixtureBill[],
  payments: { from: string; to: string; amount: number; at?: string; source?: string }[] = [],
): World {
  const billRows: BillRow[] = bills.map((b, i) => ({
    id: b.id,
    title: b.title ?? b.id,
    billDate: b.date ?? `2026-10-0${(i % 9) + 1}`,
    payerPersonId: b.payer,
    totalCents: b.total,
    printedSubtotalCents: null,
    shareToken: `share-${b.id}`,
    locked: false,
    createdAt: `2026-10-0${(i % 9) + 1}T12:00:00.000Z`,
    hasReceipt: false,
  }));
  const items: ItemRow[] = bills.flatMap((b) =>
    b.items.map((it, pos) => ({ id: it.id, billId: b.id, position: pos, name: it.name, qty: it.qty ?? 1, lineCents: it.cents })),
  );
  const shares: ShareRow[] = bills.flatMap((b) =>
    b.items.flatMap((it) => Object.entries(it.eaters ?? {}).map(([personId, units]) => ({ itemId: it.id, personId, units }))),
  );
  const pays: PaymentRow[] = payments.map((p, i) => ({
    id: `pay-${i}`,
    fromPersonId: p.from,
    toPersonId: p.to,
    amountCents: p.amount,
    paidAt: p.at ?? `2026-10-10T12:00:0${i % 10}.000Z`,
    source: p.source ?? "manual",
    note: null,
    createdAt: p.at ?? `2026-10-10T12:00:0${i % 10}.000Z`,
  }));

  const itemsByBill = new Map<string, ItemRow[]>();
  for (const it of items) itemsByBill.set(it.billId, [...(itemsByBill.get(it.billId) ?? []), it]);
  const sharesByItem = new Map<string, ShareRow[]>();
  for (const s of shares) sharesByItem.set(s.itemId, [...(sharesByItem.get(s.itemId) ?? []), s]);
  const participantsByBill = new Map<string, string[]>();
  for (const b of bills) participantsByBill.set(b.id, [b.payer, ...(b.participants ?? [])]);
  const alloc = new Map(
    billRows.map((b) => {
      const its = itemsByBill.get(b.id) ?? [];
      return [b.id, allocateBill(its, its.flatMap((i) => sharesByItem.get(i.id) ?? []), b.totalCents, b.payerPersonId)] as const;
    }),
  );

  return {
    people: new Map(people.map((p) => [p.id, p])),
    bills: billRows,
    billById: new Map(billRows.map((b) => [b.id, b])),
    itemsByBill,
    chargesByBill: new Map(),
    participantsByBill,
    sharesByItem,
    payments: pays,
    alloc,
  };
}
