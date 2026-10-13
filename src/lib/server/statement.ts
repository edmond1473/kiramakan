import "server-only";
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";
import { db } from "./db";
import { HttpError, type SessionUser } from "./auth";
import { loadWorld } from "./world";
import { analyzeParsed, loadAliases } from "./incoming";
import { centsToPlain, formatRM } from "../money";
import { STATEMENT_TEXT_PREFIX, isIncomingTransfer, parseStatement, sameName, type PdfText, type Statement } from "../tng-statement";

// TNG 交易记录 PDF → 自动记账。跟 TNG 通知用同一套规则（对名字、不超过他欠的才直接记，其他放待确认），
// 另外用每一笔的交易编号防重复：同一份记录导出几次、日期范围重叠都不会记两次。

/** 读 PDF：TNG 的 PDF 有密码；用每一段字自己的位置（pdf.js 的 getTextContent 会把相邻的栏黏在一起） */
export async function readStatementPdf(bytes: Uint8Array, password: string | undefined): Promise<Statement> {
  const { OPS } = await getResolvedPDFJS();
  let pdf;
  try {
    pdf = await getDocumentProxy(bytes, { password });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "PasswordException") {
      throw new HttpError(400, password ? "PDF 密码不对" : "这个 PDF 有密码：在 Vercel 设定 TNG_PDF_PASSWORD，或上传时填密码");
    }
    throw new HttpError(400, "打不开这个 PDF");
  }
  const pages: PdfText[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const ops = await (await pdf.getPage(p)).getOperatorList();
    const items: PdfText[] = [];
    let x = 0;
    let y = 0;
    let fresh = true;
    ops.fnArray.forEach((fn, i) => {
      const a = ops.argsArray[i];
      if (fn === OPS.setTextMatrix) {
        const m = Object.values(a[0] ?? a) as number[];
        x = m[4];
        y = m[5];
        fresh = true;
      } else if (fn === OPS.showText) {
        const str = (a[0] as unknown[]).map((g) => (g && typeof g === "object" && "unicode" in g ? String(g.unicode) : "")).join("");
        // 同一个位置连着画的字（例如「Amount 」「(RM)」）接成一段
        if (!fresh && items.length) items[items.length - 1].str += str;
        else items.push({ str, x, y });
        fresh = false;
      }
    });
    pages.push(items);
  }
  await pdf.cleanup();
  const st = parseStatement(pages);
  if (st.rows.length === 0) throw new HttpError(400, "这个 PDF 看起来不是 TNG 的交易记录（Transaction History）");
  return st;
}

export interface StatementSummary {
  period: string | null;
  /** 从这一天开始的进账才处理（第一次用的时候定下来） */
  since: string;
  incoming: number;
  recorded: number;
  pending: number;
  /** 你已经手动记过、或 TNG 通知已经记过：接上，没有再记一次 */
  linked: number;
  /** 这一笔之前的 PDF 已经处理过 */
  already: number;
  /** 自己转给自己（例如从银行转进 TNG） */
  self: number;
  beforeStart: number;
  recordedNames: string[];
}

export async function ingestStatement(user: SessionUser, st: Statement): Promise<StatementSummary> {
  const incoming = st.rows.filter(isIncomingTransfer);
  const ownNames = [st.registeredName, user.name, user.tngName].filter((n): n is string => !!n);
  const sql = await db();
  return sql.begin(async (tx) => {
    // 跟 TNG 通知排队处理：同一笔不会被两边同时记
    await tx`select pg_advisory_xact_lock(hashtext(${`incoming:${user.id}`}))`;
    // 第一次用：只处理最近两天的，之前的当作你已经自己处理过（不然以前手动记过的会被再记一次）
    const [u] = await tx<{ since: string }[]>`
      update users set statement_since = coalesce(statement_since, (now() at time zone 'Asia/Kuala_Lumpur')::date - 2)
      where id = ${user.id} returning to_char(statement_since, 'YYYY-MM-DD') as since`;
    const s: StatementSummary = {
      period: st.period,
      since: u.since,
      incoming: incoming.length,
      recorded: 0,
      pending: 0,
      linked: 0,
      already: 0,
      self: 0,
      beforeStart: 0,
      recordedNames: [],
    };
    let w = await loadWorld(tx);
    const aliases = await loadAliases(tx);

    // PDF 是按时间排的：先处理早的，后面那笔才看得到前面记好之后的账
    for (const r of incoming) {
      const amount = r.amountCents!;
      if (r.date < s.since) {
        s.beforeStart++;
        continue;
      }
      if (ownNames.some((n) => sameName(r.description, n))) {
        s.self++;
        continue;
      }
      const seen = await tx`select 1 from incoming_payments where user_id = ${user.id} and tng_ref = ${r.reference}`;
      if (seen.length) {
        s.already++;
        continue;
      }
      const at = `${r.date}T12:00:00+08:00`; // PDF 只有日期
      // 交易编号存在 tng_ref，说明里不用写
      const text = `${STATEMENT_TEXT_PREFIX} ${r.date}：${r.description} 转给你 RM ${centsToPlain(amount)}`;
      const a = analyzeParsed(w, user, aliases, { text, amountCents: amount, sender: r.description, direction: "in" });

      // TNG 通知已经收过这一笔（通知没有交易编号）：补上编号就好
      const notices = await tx<{ id: string; sender_name: string | null; from_person_id: string | null }[]>`
        select id, sender_name, from_person_id from incoming_payments
        where user_id = ${user.id} and tng_ref is null and amount_cents = ${amount} and direction <> 'out'
          and received_at between ${at}::timestamptz - interval '36 hours' and ${at}::timestamptz + interval '36 hours'
        order by received_at`;
      const notice = notices.find((n) => (n.sender_name && sameName(n.sender_name, r.description)) || (a.personId && n.from_person_id === a.personId));
      if (notice) {
        await tx`update incoming_payments set tng_ref = ${r.reference} where id = ${notice.id}`;
        s.linked++;
        continue;
      }

      // 你已经手动记过同一笔（同一个人、同样金额、前后三天内）：接上那一笔
      let paymentId: string | null = null;
      let status: "recorded" | "pending" = a.outcome === "record" ? "recorded" : "pending";
      if (a.personId) {
        const manual = await tx<{ id: string }[]>`
          select p.id from payments p
          where p.from_person_id = ${a.personId} and p.to_person_id = ${user.personId} and p.amount_cents = ${amount}
            and p.paid_at between ${at}::timestamptz - interval '3 days' and ${at}::timestamptz + interval '3 days'
            and not exists (select 1 from incoming_payments i where i.payment_id = p.id)
          order by abs(extract(epoch from p.paid_at - ${at}::timestamptz)) limit 1`;
        if (manual.length) {
          paymentId = manual[0].id;
          status = "recorded";
          s.linked++;
        }
      }
      if (!paymentId && a.outcome === "record" && a.personId) {
        const [p] = await tx<{ id: string }[]>`
          insert into payments (from_person_id, to_person_id, amount_cents, paid_at, source, note, raw, created_by)
          values (${a.personId}, ${user.personId}, ${amount}, ${at}, 'tng', 'TNG 交易记录', ${text}, ${user.id})
          returning id`;
        paymentId = p.id;
        s.recorded++;
        s.recordedNames.push(`${a.personName ?? r.description} ${formatRM(amount)}`);
        w = await loadWorld(tx); // 账变了，下一笔要看新的
      } else if (status === "pending") {
        s.pending++;
      }
      await tx`
        insert into incoming_payments
          (user_id, raw_text, sender_name, amount_cents, direction, status, reason, from_person_id, payment_id,
           verdict, verdict_kind, received_at, resolved_at, tng_ref)
        values (${user.id}, ${text}, ${r.description}, ${amount}, 'in', ${status}, ${status === "pending" ? a.reason : null},
                ${a.personId}, ${paymentId}, ${a.verdict?.message ?? null}, ${a.verdict?.kind ?? null}, ${at},
                ${status === "pending" ? null : new Date()}, ${r.reference})`;
    }
    return s;
  });
}

/** 记完之后发给你的手机通知 */
export function summaryNotice(s: StatementSummary): { title: string; body: string; url: string } | null {
  if (s.recorded === 0 && s.pending === 0) return null;
  const parts: string[] = [];
  if (s.recorded) parts.push(`记好 ${s.recorded} 笔：${s.recordedNames.slice(0, 3).join("、")}${s.recordedNames.length > 3 ? "…" : ""}`);
  if (s.pending) parts.push(`${s.pending} 笔要你确认`);
  return { title: "TNG 交易记录对好了", body: parts.join("；"), url: "/inbox" };
}

export function summaryText(s: StatementSummary): string {
  const bits = [`记好 ${s.recorded} 笔`, `待确认 ${s.pending} 笔`];
  if (s.linked) bits.push(`${s.linked} 笔已经记过（接上）`);
  if (s.already) bits.push(`${s.already} 笔之前处理过`);
  if (s.self) bits.push(`${s.self} 笔是你自己转的`);
  if (s.beforeStart) bits.push(`${s.beforeStart} 笔在 ${s.since} 之前（第一次用，不处理）`);
  return bits.join("，");
}

/** 设定页显示：从哪天开始对账、对过几笔、最近一笔是哪天 */
export async function statementInfo(userId: string): Promise<{ since: string | null; count: number; lastDate: string | null }> {
  const sql = await db();
  const [r] = await sql<{ since: string | null; count: number; last: string | null }[]>`
    select to_char(u.statement_since, 'YYYY-MM-DD') as since,
           (select count(*)::int from incoming_payments i where i.user_id = u.id and i.tng_ref is not null) as count,
           (select to_char(max(i.received_at) at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') from incoming_payments i
             where i.user_id = u.id and i.tng_ref is not null) as last
    from users u where u.id = ${userId}`;
  return { since: r?.since ?? null, count: r?.count ?? 0, lastDate: r?.last ?? null };
}
