import "server-only";
import { db } from "./db";
import { HttpError, hashPassword, randomToken, type SessionUser } from "./auth";
import { loadWorld, ledgerBetween } from "./world";
import { classifyPayment, isSettled } from "../ledger";

export interface ItemInputRow {
  id?: string;
  name: string;
  qty: number;
  lineCents: number;
}

export interface ChargeInputRow {
  label: string;
  amountCents: number;
}

export interface CreateBillInput {
  title: string;
  billDate: string;
  payerPersonId: string;
  totalCents: number;
  printedSubtotalCents: number | null;
  items: ItemInputRow[];
  charges: ChargeInputRow[];
  participantIds: string[];
  imageBase64?: string | null;
  imageMime?: string | null;
  ocrRaw?: unknown;
}

async function assertPerson(id: string) {
  const sql = await db();
  const rows = await sql`select 1 from people where id = ${id}`;
  if (rows.length === 0) throw new HttpError(400, "找不到这个人");
}

export async function createBill(input: CreateBillInput, user: SessionUser): Promise<string> {
  const sql = await db();
  await assertPerson(input.payerPersonId);
  const image = input.imageBase64 ? Buffer.from(input.imageBase64, "base64") : null;
  return sql.begin(async (tx) => {
    const [bill] = await tx`
      insert into bills (title, bill_date, payer_person_id, total_cents, printed_subtotal_cents,
                         receipt_image, receipt_mime, ocr_raw, share_token, created_by)
      values (${input.title}, ${input.billDate}, ${input.payerPersonId}, ${input.totalCents},
              ${input.printedSubtotalCents}, ${image}, ${image ? (input.imageMime ?? "image/jpeg") : null},
              ${input.ocrRaw ? tx.json(input.ocrRaw as never) : null}, ${randomToken(12)}, ${user.id})
      returning id`;
    let pos = 0;
    for (const it of input.items) {
      await tx`insert into bill_items (bill_id, position, name, qty, line_cents)
               values (${bill.id}, ${pos++}, ${it.name}, ${it.qty}, ${it.lineCents})`;
    }
    pos = 0;
    for (const c of input.charges) {
      await tx`insert into bill_charges (bill_id, position, label, amount_cents)
               values (${bill.id}, ${pos++}, ${c.label}, ${c.amountCents})`;
    }
    const ids = [...new Set([input.payerPersonId, ...input.participantIds])];
    for (const pid of ids) {
      await tx`insert into bill_participants (bill_id, person_id) values (${bill.id}, ${pid}) on conflict do nothing`;
    }
    return bill.id as string;
  });
}

export async function updateBillMeta(
  billId: string,
  patch: Partial<{ title: string; billDate: string; payerPersonId: string; totalCents: number; locked: boolean }>,
) {
  const sql = await db();
  if (patch.payerPersonId) await assertPerson(patch.payerPersonId);
  const rows = await sql`
    update bills set
      title = coalesce(${patch.title ?? null}, title),
      bill_date = coalesce(${patch.billDate ?? null}::date, bill_date),
      payer_person_id = coalesce(${patch.payerPersonId ?? null}::uuid, payer_person_id),
      total_cents = coalesce(${patch.totalCents ?? null}::int, total_cents),
      locked = coalesce(${patch.locked ?? null}::boolean, locked),
      updated_at = now()
    where id = ${billId} returning id, payer_person_id`;
  if (rows.length === 0) throw new HttpError(404, "找不到这张单");
  if (patch.payerPersonId) {
    await sql`insert into bill_participants (bill_id, person_id) values (${billId}, ${patch.payerPersonId}) on conflict do nothing`;
  }
}

/** 改 item：有 id 的保留（认领也保留），没 id 的新增，不在名单里的删掉 */
export async function replaceItems(billId: string, items: ItemInputRow[], charges: ChargeInputRow[]) {
  const sql = await db();
  await sql.begin(async (tx) => {
    const existing = await tx`select id from bill_items where bill_id = ${billId}`;
    const keep = new Set(items.filter((i) => i.id).map((i) => i.id as string));
    for (const e of existing) {
      if (!keep.has(e.id)) await tx`delete from bill_items where id = ${e.id}`;
    }
    let pos = 0;
    for (const it of items) {
      if (it.id) {
        await tx`update bill_items set position = ${pos++}, name = ${it.name}, qty = ${it.qty}, line_cents = ${it.lineCents}
                 where id = ${it.id} and bill_id = ${billId}`;
      } else {
        await tx`insert into bill_items (bill_id, position, name, qty, line_cents)
                 values (${billId}, ${pos++}, ${it.name}, ${it.qty}, ${it.lineCents})`;
      }
    }
    await tx`delete from bill_charges where bill_id = ${billId}`;
    pos = 0;
    for (const c of charges) {
      await tx`insert into bill_charges (bill_id, position, label, amount_cents)
               values (${billId}, ${pos++}, ${c.label}, ${c.amountCents})`;
    }
    await tx`update bills set updated_at = now() where id = ${billId}`;
  });
}

export async function addParticipants(billId: string, personIds: string[]) {
  const sql = await db();
  for (const pid of personIds) {
    await sql`insert into bill_participants (bill_id, person_id) values (${billId}, ${pid}) on conflict do nothing`;
  }
}

export async function removeParticipant(billId: string, personId: string) {
  const sql = await db();
  const [b] = await sql`select payer_person_id from bills where id = ${billId}`;
  if (!b) throw new HttpError(404, "找不到这张单");
  if (b.payer_person_id === personId) throw new HttpError(400, "付钱的人不能移除");
  await sql.begin(async (tx) => {
    await tx`delete from item_shares where person_id = ${personId}
             and item_id in (select id from bill_items where bill_id = ${billId})`;
    await tx`delete from bill_participants where bill_id = ${billId} and person_id = ${personId}`;
  });
}

async function itemBelongs(billId: string, itemId: string) {
  const sql = await db();
  const rows = await sql`select 1 from bill_items where id = ${itemId} and bill_id = ${billId}`;
  if (rows.length === 0) throw new HttpError(404, "找不到这个 item");
}

/** 一个 item 由谁吃（整组替换） */
export async function setItemShares(billId: string, itemId: string, shares: { personId: string; units: number }[]) {
  await itemBelongs(billId, itemId);
  const sql = await db();
  await sql.begin(async (tx) => {
    await tx`delete from item_shares where item_id = ${itemId}`;
    for (const s of shares) {
      if (s.units <= 0) continue;
      await tx`insert into item_shares (item_id, person_id, units) values (${itemId}, ${s.personId}, ${s.units})`;
      await tx`insert into bill_participants (bill_id, person_id) values (${billId}, ${s.personId}) on conflict do nothing`;
    }
    await tx`update bills set updated_at = now() where id = ${billId}`;
  });
}

/** 朋友自己认领（units=0 代表取消） */
export async function claimItem(billId: string, itemId: string, personId: string, units: number) {
  await itemBelongs(billId, itemId);
  const sql = await db();
  if (units <= 0) {
    await sql`delete from item_shares where item_id = ${itemId} and person_id = ${personId}`;
  } else {
    await sql`insert into item_shares (item_id, person_id, units) values (${itemId}, ${personId}, ${units})
              on conflict (item_id, person_id) do update set units = excluded.units`;
    await sql`insert into bill_participants (bill_id, person_id) values (${billId}, ${personId}) on conflict do nothing`;
  }
  await sql`update bills set updated_at = now() where id = ${billId}`;
}

/** 没人认领的 item → 全部参与者平分 */
export async function splitUnclaimedEqually(billId: string) {
  const sql = await db();
  await sql.begin(async (tx) => {
    const parts = await tx`select person_id from bill_participants where bill_id = ${billId}`;
    if (parts.length === 0) throw new HttpError(400, "这张单还没有人");
    const unclaimed = await tx`
      select i.id from bill_items i
      where i.bill_id = ${billId} and not exists (select 1 from item_shares s where s.item_id = i.id)`;
    for (const it of unclaimed) {
      for (const p of parts) {
        await tx`insert into item_shares (item_id, person_id, units) values (${it.id}, ${p.person_id}, 1)
                 on conflict do nothing`;
      }
    }
  });
}

export async function deleteBill(billId: string) {
  const sql = await db();
  await sql`delete from bills where id = ${billId}`;
}

// ---------- 人 ----------

export async function findOrCreatePerson(name: string): Promise<string> {
  const sql = await db();
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new HttpError(400, "名字不能空");
  const found = await sql`select id from people where lower(name) = lower(${clean}) and is_active order by created_at limit 1`;
  if (found.length) return found[0].id;
  const [p] = await sql`insert into people (name, token) values (${clean}, ${randomToken(12)}) returning id`;
  return p.id;
}

export async function createPerson(input: { name: string; tngName?: string | null; phone?: string | null }) {
  const sql = await db();
  const clean = input.name.trim().replace(/\s+/g, " ");
  if (!clean) throw new HttpError(400, "名字不能空");
  const dup = await sql`select id from people where lower(name) = lower(${clean}) and is_active`;
  if (dup.length) throw new HttpError(409, `已经有一个叫「${clean}」的朋友`);
  const [p] = await sql`
    insert into people (name, tng_name, phone, token)
    values (${clean}, ${input.tngName?.trim() || null}, ${input.phone?.trim() || null}, ${randomToken(12)})
    returning id`;
  return p.id as string;
}

export async function updatePerson(id: string, patch: { name?: string; tngName?: string | null; phone?: string | null; isActive?: boolean }) {
  const sql = await db();
  const name = patch.name?.trim().replace(/\s+/g, " ");
  if (name !== undefined && !name) throw new HttpError(400, "名字不能空");
  const rows = await sql`
    update people set
      name = coalesce(${name ?? null}, name),
      tng_name = case when ${patch.tngName !== undefined} then ${patch.tngName?.trim() || null} else tng_name end,
      phone = case when ${patch.phone !== undefined} then ${patch.phone?.trim() || null} else phone end,
      is_active = coalesce(${patch.isActive ?? null}::boolean, is_active)
    where id = ${id} returning id`;
  if (rows.length === 0) throw new HttpError(404, "找不到这个人");
}

// ---------- 付款 ----------

export async function recordPayment(
  input: { fromPersonId: string; toPersonId: string; amountCents: number; paidAt?: string | null; note?: string | null; source?: string },
  user: SessionUser,
) {
  if (input.fromPersonId === input.toPersonId) throw new HttpError(400, "不能自己付给自己");
  if (input.toPersonId !== user.personId && input.fromPersonId !== user.personId && !user.isAdmin) {
    throw new HttpError(403, "只能记录跟你有关的付款");
  }
  await assertPerson(input.fromPersonId);
  await assertPerson(input.toPersonId);
  const sql = await db();
  const [p] = await sql`
    insert into payments (from_person_id, to_person_id, amount_cents, paid_at, source, note, created_by)
    values (${input.fromPersonId}, ${input.toPersonId}, ${input.amountCents},
            coalesce(${input.paidAt ?? null}::timestamptz, now()), ${input.source ?? "manual"},
            ${input.note?.trim() || null}, ${user.id})
    returning id`;
  return p.id as string;
}

export async function previewPayment(fromPersonId: string, toPersonId: string, amountCents: number) {
  const w = await loadWorld();
  const ledger = ledgerBetween(w, fromPersonId, toPersonId);
  return { verdict: classifyPayment(amountCents, ledger), balance: ledger.balance };
}

export async function deletePayment(id: string, user: SessionUser) {
  const sql = await db();
  const [p] = await sql`select from_person_id, to_person_id from payments where id = ${id}`;
  if (!p) throw new HttpError(404, "找不到这笔付款");
  if (p.to_person_id !== user.personId && p.from_person_id !== user.personId && !user.isAdmin) {
    throw new HttpError(403, "只能删除跟你有关的付款");
  }
  await sql`delete from payments where id = ${id}`;
}

/** 你欠对方、对方也欠你 → 互相抵掉较小的那个数 */
export async function offsetWith(user: SessionUser, otherPersonId: string) {
  const w = await loadWorld();
  const iOwe = Math.max(0, ledgerBetween(w, user.personId, otherPersonId).balance);
  const theyOwe = Math.max(0, ledgerBetween(w, otherPersonId, user.personId).balance);
  const amount = Math.min(iOwe, theyOwe);
  if (amount <= 0 || isSettled(amount)) throw new HttpError(400, "没有可以互抵的金额");
  const sql = await db();
  const note = "互抵";
  await sql.begin(async (tx) => {
    await tx`insert into payments (from_person_id, to_person_id, amount_cents, source, note, created_by)
             values (${user.personId}, ${otherPersonId}, ${amount}, 'offset', ${note}, ${user.id})`;
    await tx`insert into payments (from_person_id, to_person_id, amount_cents, source, note, created_by)
             values (${otherPersonId}, ${user.personId}, ${amount}, 'offset', ${note}, ${user.id})`;
  });
  return amount;
}

// ---------- 帐号 ----------

export async function createFirstAdmin(input: { name: string; username: string; password: string }) {
  const sql = await db();
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727102)`;
    const any = await tx`select 1 from users limit 1`;
    if (any.length) throw new HttpError(409, "已经设定过了，请直接登入");
    const [p] = await tx`insert into people (name, token) values (${input.name.trim()}, ${randomToken(12)}) returning id`;
    const [u] = await tx`
      insert into users (person_id, username, password_hash, is_admin, webhook_key)
      values (${p.id}, ${input.username.trim().toLowerCase()}, ${await hashPassword(input.password)}, true, ${randomToken(24)})
      returning id`;
    return u.id as string;
  });
}

export async function createPayerAccount(input: { personId?: string | null; name?: string | null; username: string; password: string }) {
  const sql = await db();
  const username = input.username.trim().toLowerCase();
  const exists = await sql`select 1 from users where username = ${username}`;
  if (exists.length) throw new HttpError(409, "这个登入名已经有人用了");
  let personId = input.personId ?? null;
  if (personId) {
    const has = await sql`select 1 from users where person_id = ${personId}`;
    if (has.length) throw new HttpError(409, "这个人已经有帐号了");
    await assertPerson(personId);
  } else {
    if (!input.name?.trim()) throw new HttpError(400, "请填名字");
    personId = await findOrCreatePerson(input.name);
  }
  await sql`
    insert into users (person_id, username, password_hash, is_admin, webhook_key)
    values (${personId}, ${username}, ${await hashPassword(input.password)}, false, ${randomToken(24)})`;
}

export async function updateMe(
  user: SessionUser,
  patch: { name?: string; tngName?: string | null; qrPayload?: string | null; qrAmountEnabled?: boolean; payPhone?: string | null },
) {
  const sql = await db();
  if (patch.name !== undefined || patch.tngName !== undefined) {
    await updatePerson(user.personId, { name: patch.name, tngName: patch.tngName });
  }
  await sql`
    update users set
      qr_payload = case when ${patch.qrPayload !== undefined} then ${patch.qrPayload ?? null} else qr_payload end,
      qr_amount_enabled = coalesce(${patch.qrAmountEnabled ?? null}::boolean, qr_amount_enabled),
      pay_phone = case when ${patch.payPhone !== undefined} then ${patch.payPhone?.trim() || null} else pay_phone end
    where id = ${user.id}`;
}

export async function changePassword(user: SessionUser, newPassword: string) {
  const sql = await db();
  await sql`update users set password_hash = ${await hashPassword(newPassword)} where id = ${user.id}`;
}
