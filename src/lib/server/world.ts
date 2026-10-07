import "server-only";
import type postgres from "postgres";
import { allocateBill, type Allocation } from "../money";
import {
  buildLedger,
  DEFAULT_TOLERANCE_CENTS,
  isSettled,
  type Charge,
  type ChargeState,
  type PairLedger,
  type PaymentLite,
} from "../ledger";
import { db } from "./db";

// 资料量很小（朋友之间的饭局），所以每次把全部资料读进来在内存算，最简单也最不会算错。

export interface PersonRow {
  id: string;
  name: string;
  tngName: string | null;
  phone: string | null;
  token: string;
  isActive: boolean;
  userId: string | null;
  qrPayload: string | null;
  qrAmountEnabled: boolean;
  payPhone: string | null;
}

export interface BillRow {
  id: string;
  title: string;
  billDate: string;
  payerPersonId: string;
  totalCents: number;
  printedSubtotalCents: number | null;
  shareToken: string;
  locked: boolean;
  createdAt: string;
  hasReceipt: boolean;
}

export interface ItemRow {
  id: string;
  billId: string;
  position: number;
  name: string;
  qty: number;
  lineCents: number;
}

export interface ChargeRow {
  id: string;
  billId: string;
  position: number;
  label: string;
  amountCents: number;
}

export interface ShareRow {
  itemId: string;
  personId: string;
  units: number;
}

export interface PaymentRow {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  amountCents: number;
  paidAt: string;
  source: string;
  note: string | null;
  createdAt: string;
}

export interface World {
  people: Map<string, PersonRow>;
  bills: BillRow[];
  billById: Map<string, BillRow>;
  itemsByBill: Map<string, ItemRow[]>;
  chargesByBill: Map<string, ChargeRow[]>;
  participantsByBill: Map<string, string[]>;
  sharesByItem: Map<string, ShareRow[]>;
  payments: PaymentRow[];
  alloc: Map<string, Allocation>;
}

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : String(d));

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** q：在 transaction 里读的话传 tx 进来（不要另外占一条连线） */
export async function loadWorld(q?: postgres.Sql | postgres.TransactionSql): Promise<World> {
  const sql = q ?? (await db());
  const [people, bills, items, charges, parts, shares, payments] = await Promise.all([
    sql`
      select p.id, p.name, p.tng_name, p.phone, p.token, p.is_active,
             u.id as user_id, u.qr_payload, u.qr_amount_enabled, u.pay_phone
      from people p left join users u on u.person_id = p.id
      order by lower(p.name)`,
    sql`
      select id, title, to_char(bill_date, 'YYYY-MM-DD') as bill_date, payer_person_id, total_cents,
             printed_subtotal_cents, share_token, locked, created_at, (receipt_image is not null) as has_receipt
      from bills order by bill_date desc, created_at desc`,
    sql`select id, bill_id, position, name, qty, line_cents from bill_items order by bill_id, position`,
    sql`select id, bill_id, position, label, amount_cents from bill_charges order by bill_id, position`,
    sql`select bill_id, person_id from bill_participants order by added_at`,
    sql`select item_id, person_id, units from item_shares`,
    sql`select id, from_person_id, to_person_id, amount_cents, paid_at, source, note, created_at
        from payments order by paid_at, created_at`,
  ]);

  const peopleMap = new Map<string, PersonRow>();
  for (const r of people) {
    peopleMap.set(r.id, {
      id: r.id,
      name: r.name,
      tngName: r.tng_name,
      phone: r.phone,
      token: r.token,
      isActive: r.is_active,
      userId: r.user_id,
      qrPayload: r.qr_payload,
      qrAmountEnabled: !!r.qr_amount_enabled,
      payPhone: r.pay_phone,
    });
  }
  const billRows: BillRow[] = bills.map((r) => ({
    id: r.id,
    title: r.title,
    billDate: r.bill_date,
    payerPersonId: r.payer_person_id,
    totalCents: r.total_cents,
    printedSubtotalCents: r.printed_subtotal_cents,
    shareToken: r.share_token,
    locked: r.locked,
    createdAt: iso(r.created_at),
    hasReceipt: r.has_receipt,
  }));
  const itemRows: ItemRow[] = items.map((r) => ({
    id: r.id,
    billId: r.bill_id,
    position: r.position,
    name: r.name,
    qty: Number(r.qty),
    lineCents: r.line_cents,
  }));
  const chargeRows: ChargeRow[] = charges.map((r) => ({
    id: r.id,
    billId: r.bill_id,
    position: r.position,
    label: r.label,
    amountCents: r.amount_cents,
  }));
  const shareRows: ShareRow[] = shares.map((r) => ({ itemId: r.item_id, personId: r.person_id, units: r.units }));
  const paymentRows: PaymentRow[] = payments.map((r) => ({
    id: r.id,
    fromPersonId: r.from_person_id,
    toPersonId: r.to_person_id,
    amountCents: r.amount_cents,
    paidAt: iso(r.paid_at),
    source: r.source,
    note: r.note,
    createdAt: iso(r.created_at),
  }));

  const itemsByBill = groupBy(itemRows, (i) => i.billId);
  const sharesByItem = groupBy(shareRows, (s) => s.itemId);
  const participantsByBill = new Map<string, string[]>();
  for (const p of parts) {
    const list = participantsByBill.get(p.bill_id) ?? [];
    list.push(p.person_id);
    participantsByBill.set(p.bill_id, list);
  }

  const alloc = new Map<string, Allocation>();
  for (const b of billRows) {
    const its = itemsByBill.get(b.id) ?? [];
    const shs = its.flatMap((i) => sharesByItem.get(i.id) ?? []);
    alloc.set(b.id, allocateBill(its, shs, b.totalCents, b.payerPersonId));
  }

  return {
    people: peopleMap,
    bills: billRows,
    billById: new Map(billRows.map((b) => [b.id, b])),
    itemsByBill,
    chargesByBill: groupBy(chargeRows, (c) => c.billId),
    participantsByBill,
    sharesByItem,
    payments: paymentRows,
    alloc,
  };
}

// ---------- 账本 ----------

/** debtor 欠 creditor 的每一餐 */
export function chargesBetween(w: World, debtorId: string, creditorId: string): Charge[] {
  const out: Charge[] = [];
  for (const b of w.bills) {
    if (b.payerPersonId !== creditorId || debtorId === creditorId) continue;
    const amt = w.alloc.get(b.id)?.people.get(debtorId);
    if (!amt || amt.owed <= 0) continue;
    out.push({ billId: b.id, billDate: b.billDate, createdAt: b.createdAt, owed: amt.owed, preTax: amt.preTax });
  }
  return out;
}

export function paymentsBetween(w: World, fromId: string, toId: string): PaymentLite[] {
  return w.payments
    .filter((p) => p.fromPersonId === fromId && p.toPersonId === toId)
    .map((p) => ({ id: p.id, amount: p.amountCents, paidAt: p.paidAt }));
}

export function ledgerBetween(w: World, debtorId: string, creditorId: string): PairLedger {
  return buildLedger(chargesBetween(w, debtorId, creditorId), paymentsBetween(w, debtorId, creditorId));
}

/** 有出现过的（欠钱的人, 收钱的人）组合 */
export function allPairs(w: World): [string, string][] {
  const keys = new Set<string>();
  for (const b of w.bills) {
    const a = w.alloc.get(b.id);
    if (!a) continue;
    for (const [pid, amt] of a.people) {
      if (pid !== b.payerPersonId && amt.owed > 0) keys.add(`${pid}|${b.payerPersonId}`);
    }
  }
  for (const p of w.payments) keys.add(`${p.fromPersonId}|${p.toPersonId}`);
  return [...keys].map((k) => k.split("|") as [string, string]);
}

export interface PairSummary {
  debtorId: string;
  creditorId: string;
  ledger: PairLedger;
  openCharges: ChargeState[];
}

export function pairSummaries(w: World): PairSummary[] {
  return allPairs(w).map(([d, c]) => {
    const ledger = ledgerBetween(w, d, c);
    return { debtorId: d, creditorId: c, ledger, openCharges: ledger.charges.filter((x) => x.status !== "paid") };
  });
}

/** 某人的状况：谁欠他、他欠谁（还没结清的） */
export function balancesFor(w: World, personId: string) {
  const pairs = pairSummaries(w);
  const receivables = pairs
    .filter((p) => p.creditorId === personId && !isSettled(p.ledger.balance))
    .sort((a, b) => b.ledger.balance - a.ledger.balance);
  const payables = pairs
    .filter((p) => p.debtorId === personId && !isSettled(p.ledger.balance))
    .sort((a, b) => b.ledger.balance - a.ledger.balance);
  return { receivables, payables };
}

// ---------- 一张单的完整画面 ----------

export interface BillParticipantView {
  personId: string;
  name: string;
  isPayer: boolean;
  preTax: number;
  owed: number;
  paid: number;
  remaining: number;
  status: "payer" | "paid" | "forgot_tax" | "partial" | "unpaid" | "none";
}

export interface BillItemView {
  id: string;
  position: number;
  name: string;
  qty: number;
  lineCents: number;
  denom: number;
  claimedUnits: number;
  unassignedCents: number;
  overClaimed: boolean;
  shares: { personId: string; name: string; units: number }[];
}

export interface PayeeInfo {
  personId: string;
  name: string;
  qrPayload: string | null;
  qrAmountEnabled: boolean;
  payPhone: string | null;
}

export interface BillView {
  id: string;
  title: string;
  billDate: string;
  shareToken: string;
  locked: boolean;
  hasReceipt: boolean;
  totalCents: number;
  itemsSubtotal: number;
  printedSubtotalCents: number | null;
  factor: number;
  unassigned: { preTax: number; owed: number };
  payer: PayeeInfo;
  items: BillItemView[];
  charges: { id: string; label: string; amountCents: number }[];
  participants: BillParticipantView[];
}

export function payeeInfo(w: World, personId: string): PayeeInfo {
  const p = w.people.get(personId);
  return {
    personId,
    name: p?.name ?? "?",
    qrPayload: p?.qrPayload ?? null,
    qrAmountEnabled: p?.qrAmountEnabled ?? false,
    payPhone: p?.payPhone ?? p?.phone ?? null,
  };
}

export function billView(w: World, billId: string): BillView | null {
  const b = w.billById.get(billId);
  if (!b) return null;
  const a = w.alloc.get(b.id)!;
  const items = (w.itemsByBill.get(b.id) ?? []).map<BillItemView>((it) => {
    const split = a.items.get(it.id)!;
    return {
      id: it.id,
      position: it.position,
      name: it.name,
      qty: it.qty,
      lineCents: it.lineCents,
      denom: split.denom,
      claimedUnits: split.claimedUnits,
      unassignedCents: split.unassignedCents,
      overClaimed: split.overClaimed,
      shares: (w.sharesByItem.get(it.id) ?? []).map((s) => ({
        personId: s.personId,
        name: w.people.get(s.personId)?.name ?? "?",
        units: s.units,
      })),
    };
  });

  // 参与者 = 明确加进来的人 + 有认领 item 的人 + 付钱的人
  const ids: string[] = [];
  const add = (id: string) => {
    if (!ids.includes(id)) ids.push(id);
  };
  add(b.payerPersonId);
  for (const id of w.participantsByBill.get(b.id) ?? []) add(id);
  for (const id of a.people.keys()) add(id);

  const participants = ids.map<BillParticipantView>((pid) => {
    const amt = a.people.get(pid) ?? { preTax: 0, owed: 0 };
    const name = w.people.get(pid)?.name ?? "?";
    if (pid === b.payerPersonId) {
      return { personId: pid, name, isPayer: true, ...amt, paid: 0, remaining: 0, status: "payer" };
    }
    if (amt.owed <= 0) {
      return { personId: pid, name, isPayer: false, ...amt, paid: 0, remaining: 0, status: "none" };
    }
    const led = ledgerBetween(w, pid, b.payerPersonId);
    const st = led.charges.find((c) => c.billId === b.id);
    return {
      personId: pid,
      name,
      isPayer: false,
      ...amt,
      paid: st?.paid ?? 0,
      remaining: st?.remaining ?? amt.owed,
      status: st?.status ?? "unpaid",
    };
  });

  return {
    id: b.id,
    title: b.title,
    billDate: b.billDate,
    shareToken: b.shareToken,
    locked: b.locked,
    hasReceipt: b.hasReceipt,
    totalCents: b.totalCents,
    itemsSubtotal: a.itemsSubtotal,
    printedSubtotalCents: b.printedSubtotalCents,
    factor: a.factor,
    unassigned: a.unassigned,
    payer: payeeInfo(w, b.payerPersonId),
    items,
    charges: (w.chargesByBill.get(b.id) ?? []).map((c) => ({ id: c.id, label: c.label, amountCents: c.amountCents })),
    participants,
  };
}

export function billByToken(w: World, token: string): BillRow | null {
  return w.bills.find((b) => b.shareToken === token) ?? null;
}

export { DEFAULT_TOLERANCE_CENTS };
