import "server-only";
import type postgres from "postgres";
import { db } from "./db";
import { matchClaims, type OpenClaim } from "../claims";
import { DEFAULT_TOLERANCE_CENTS } from "../ledger";

// 朋友按「去付款」（打开 TNG 那一刻）先记一笔「待核对」的付款（payments.verified = false），网站马上算他付了。
// 晚上 TNG 交易记录 PDF 进来：有这笔钱 → 核对好；找不到 → 删掉，改回未付。

type Q = postgres.Sql | postgres.TransactionSql;

/** 马来西亚今天的日期 YYYY-MM-DD */
export function todayMY(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 朋友按了「去付款」：billId = 在哪一餐按的（那一餐先算） */
export async function createClaim(input: { fromPersonId: string; toPersonId: string; amountCents: number; billId: string | null }) {
  const sql = await db();
  await sql.begin(async (tx) => {
    // 连按两下只记一次
    await tx`select pg_advisory_xact_lock(hashtext(${`claim:${input.fromPersonId}:${input.toPersonId}`}))`;
    await tx`
      insert into payments (from_person_id, to_person_id, amount_cents, source, note, verified, bill_id)
      select ${input.fromPersonId}, ${input.toPersonId}, ${input.amountCents}, 'claim', '朋友按了付款', false, ${input.billId}
      where not exists (
        select 1 from payments
        where from_person_id = ${input.fromPersonId} and to_person_id = ${input.toPersonId} and source = 'claim' and not verified
          and bill_id is not distinct from ${input.billId}::uuid and created_at > now() - interval '1 minute')`;
  });
}

/** 他还没核对的「去付款」（按的先后） */
async function openClaims(q: Q, fromPersonId: string, toPersonId: string): Promise<OpenClaim[]> {
  const rows = await q<{ id: string; amount_cents: number; date: string }[]>`
    select id, amount_cents, to_char(created_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') as date
    from payments
    where from_person_id = ${fromPersonId} and to_person_id = ${toPersonId} and source = 'claim' and not verified
    order by created_at`;
  return rows.map((r) => ({ id: r.id, amountCents: r.amount_cents, date: r.date }));
}

/** 记收款前看一下：他有没有按过「去付款」、这个金额会不会接上那几笔 */
export async function claimPreview(fromPersonId: string, toPersonId: string, amountCents: number) {
  const claims = await openClaims(await db(), fromPersonId, toPersonId);
  const ids = matchClaims(claims, amountCents, todayMY());
  return {
    openTotal: claims.reduce((s, c) => s + c.amountCents, 0),
    matches: ids.length > 0,
  };
}

/** 朋友说「其实还没付」：有 billId 只取消那一餐的，没有就取消全部 */
export async function cancelClaims(fromPersonId: string, toPersonId: string, billId: string | null) {
  const sql = await db();
  await sql`
    delete from payments
    where from_person_id = ${fromPersonId} and to_person_id = ${toPersonId} and source = 'claim' and not verified
      ${billId ? sql`and bill_id = ${billId}` : sql``}`;
}

/**
 * 真的收到一笔钱（PDF / TNG 通知 / 你手动记）：对上他按过的「去付款」就改成核对过。
 * 返回那笔付款的 id（对不上 → null，照平常的规则处理）。date = 转账那天（YYYY-MM-DD）
 */
export async function confirmClaims(
  q: Q,
  fromPersonId: string,
  toPersonId: string,
  amountCents: number,
  date: string,
  by: "tng" | "you" = "tng",
): Promise<string | null> {
  const ids = matchClaims(await openClaims(q, fromPersonId, toPersonId), amountCents, date);
  if (ids.length === 0) return null;
  const note = by === "tng" ? "朋友按了付款 · TNG 核对过 ✓" : "朋友按了付款 · 你确认过 ✓";
  if (ids.length === 1) {
    // 金额以真的转账为准（例如凑整数多给了几毛）
    await q`update payments set verified = true, amount_cents = ${amountCents}, note = ${note} where id = ${ids[0]}`;
  } else {
    await q`update payments set verified = true, note = ${note} where id in ${q(ids)}`;
  }
  return ids[0];
}

/**
 * TNG 交易记录里找不到的「去付款」→ 删掉（改回未付）。
 * 只管这份 PDF 包括的日子；PDF 导出前一小时内才按的先不管（可能是导出之后才转），等下一份。
 * 有一笔金额差不多、还在「待确认」的进账（例如名字还没认得）也先不管，等你选了是谁再对。
 */
export async function expireClaims(
  tx: Q,
  user: { id: string; personId: string },
  range: { start: string; end: string },
  pdfCreatedAt: string | null,
): Promise<{ name: string; amountCents: number }[]> {
  const cutoff = new Date(Math.min(pdfCreatedAt ? Date.parse(pdfCreatedAt) : Date.now(), Date.now()) - 3600_000);
  return tx<{ name: string; amountCents: number }[]>`
    delete from payments p using people f
    where f.id = p.from_person_id and p.to_person_id = ${user.personId} and p.source = 'claim' and not p.verified
      and (p.created_at at time zone 'Asia/Kuala_Lumpur')::date between ${range.start}::date and ${range.end}::date
      and p.created_at < ${cutoff}
      and not exists (
        select 1 from incoming_payments i
        where i.user_id = ${user.id} and i.status = 'pending'
          and i.amount_cents between p.amount_cents - ${DEFAULT_TOLERANCE_CENTS} and p.amount_cents + 100
          and i.received_at >= p.created_at - interval '1 day')
    returning f.name, p.amount_cents as "amountCents"`;
}
