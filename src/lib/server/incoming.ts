import "server-only";
import type postgres from "postgres";
import { db } from "./db";
import { HttpError, getUserById, randomToken, type SessionUser } from "./auth";
import { ledgerBetween, loadWorld, type World } from "./world";
import { classifyPayment, DEFAULT_TOLERANCE_CENTS, type PaymentVerdict } from "../ledger";
import { formatRM } from "../money";
import { matchSender, normalizeName, parseTngNotice, type Direction, type MatchCandidate } from "../tng-notify";
import { pendingText, recordedText, type NoticeText, type PendingReason } from "../remind";

// TNG 进账通知 → 自动记账。
// 规则：名字对得上、而且这笔钱不超过他欠你的 → 直接记好；
// 对不上名字、他没欠你钱、或多给了 → 先放「待确认」，按一下才记（朋友可能是为了别的事转钱给你）。

export type IncomingStatus = "recorded" | "pending" | "ignored" | "unparsed";

export interface Analysis {
  text: string;
  amountCents: number | null;
  sender: string | null;
  direction: Direction;
  outcome: "record" | "pending" | "ignore" | "unparsed";
  reason: PendingReason | null;
  personId: string | null;
  personName: string | null;
  /** 他记这笔之前欠你多少 */
  owed: number;
  verdict: PaymentVerdict | null;
  /** 名字分数一样高的人（让你选） */
  tied: string[];
}

export interface IngestResult extends Analysis {
  status: IncomingStatus | "duplicate";
  id: string | null;
  /** 要不要发手机通知、发什么 */
  notify: (NoticeText & { url: string }) | null;
  /** 跟手动记过的同一笔对上了，没有再记一次 */
  linkedManual: boolean;
}

const tol = DEFAULT_TOLERANCE_CENTS;

// ---------- 网址里的密钥 ----------

export async function userByWebhookKey(key: string): Promise<SessionUser | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return null;
  const sql = await db();
  const rows = await sql<{ id: string }[]>`select id from users where webhook_key = ${key}`;
  return rows[0] ? getUserById(rows[0].id) : null;
}

export async function webhookKeyFor(userId: string): Promise<string> {
  const sql = await db();
  const [r] = await sql<{ webhook_key: string }[]>`
    update users set webhook_key = coalesce(webhook_key, ${randomToken(24)}) where id = ${userId} returning webhook_key`;
  return r.webhook_key;
}

export async function rotateWebhookKey(userId: string): Promise<string> {
  const sql = await db();
  const [r] = await sql<{ webhook_key: string }[]>`
    update users set webhook_key = ${randomToken(24)} where id = ${userId} returning webhook_key`;
  return r.webhook_key;
}

// ---------- 认人 ----------

async function loadAliases(q?: postgres.Sql | postgres.TransactionSql): Promise<Map<string, string[]>> {
  const sql = q ?? (await db());
  const rows = await sql<{ alias: string; person_id: string }[]>`select alias, person_id from tng_aliases`;
  const m = new Map<string, string[]>();
  for (const r of rows) m.set(r.person_id, [...(m.get(r.person_id) ?? []), r.alias]);
  return m;
}

function owedBy(w: World, debtorId: string, creditorId: string): number {
  return Math.max(0, ledgerBetween(w, debtorId, creditorId).balance);
}

export function candidatesFor(w: World, me: { personId: string }, aliases: Map<string, string[]>): MatchCandidate[] {
  const out: MatchCandidate[] = [];
  for (const p of w.people.values()) {
    if (p.id === me.personId) continue;
    const owes = owedBy(w, p.id, me.personId) > tol;
    if (!p.isActive && !owes) continue;
    out.push({
      personId: p.id,
      tngNames: [p.tngName, ...(aliases.get(p.id) ?? [])].filter((x): x is string => !!x),
      displayName: p.name,
      owes,
    });
  }
  return out;
}

/** 看一个通知会怎么处理（不写资料库；「试一试」也用这个） */
export function analyze(w: World, me: { personId: string }, aliases: Map<string, string[]>, text: string): Analysis {
  const parsed = parseTngNotice(text);
  const base: Analysis = {
    ...parsed,
    outcome: "ignore",
    reason: null,
    personId: null,
    personName: null,
    owed: 0,
    verdict: null,
    tied: [],
  };
  if (parsed.direction === "out" || parsed.direction === "other") return base;
  if (!parsed.amountCents) return { ...base, outcome: "unparsed" };

  const match = matchSender(parsed.sender, candidatesFor(w, me, aliases));
  if (!match.personId) {
    return { ...base, outcome: "pending", reason: match.tied.length > 1 ? "tied" : "unknown_sender", tied: match.tied };
  }
  const personId = match.personId;
  const ledger = ledgerBetween(w, personId, me.personId);
  const owed = Math.max(0, ledger.balance);
  const verdict = classifyPayment(parsed.amountCents, ledger);
  const personName = w.people.get(personId)?.name ?? "?";
  const withPerson = { ...base, personId, personName, owed, verdict };
  if (parsed.direction !== "in") return { ...withPerson, outcome: "pending", reason: "unsure" };
  if (verdict.kind === "nothing_owed") return { ...withPerson, outcome: "pending", reason: "no_debt" };
  if (verdict.kind === "overpay") return { ...withPerson, outcome: "pending", reason: "overpay" };
  return { ...withPerson, outcome: "record" };
}

// ---------- 收通知 ----------

/** iPhone 捷径传来一个 TNG 通知 */
export async function ingestNotice(user: SessionUser, rawText: string): Promise<IngestResult> {
  const text = rawText.replace(/\r/g, "").trim().slice(0, 2000);
  if (!text) throw new HttpError(400, "没有收到通知内容");
  const sql = await db();
  const settings = await sql<{ notify_payments: boolean }[]>`select notify_payments from users where id = ${user.id}`;
  const notifyPayments = settings[0]?.notify_payments ?? true;

  return sql.begin(async (tx) => {
    // 同一个人的通知一个一个处理：第二笔要看到第一笔记好之后的账
    await tx`select pg_advisory_xact_lock(hashtext(${`incoming:${user.id}`}))`;
    const dup = await tx`
      select id from incoming_payments
      where user_id = ${user.id} and raw_text = ${text} and received_at > now() - interval '2 minutes' limit 1`;
    const w = await loadWorld(tx);
    const a = analyze(w, user, await loadAliases(tx), text);
    if (dup.length) {
      return { ...a, status: "duplicate", id: dup[0].id as string, notify: null, linkedManual: false };
    }

    let paymentId: string | null = null;
    let linkedManual = false;
    if (a.outcome === "record" && a.personId && a.amountCents) {
      // 你自己已经手动记过同一笔：接上那一笔，不要记两次
      const manual = await tx`
        select p.id from payments p
        where p.from_person_id = ${a.personId} and p.to_person_id = ${user.personId}
          and p.amount_cents = ${a.amountCents} and p.source = 'manual'
          and p.created_at > now() - interval '12 hours'
          and not exists (select 1 from incoming_payments i where i.payment_id = p.id)
        order by p.created_at desc limit 1`;
      if (manual.length) {
        paymentId = manual[0].id;
        linkedManual = true;
      } else {
        const [p] = await tx`
          insert into payments (from_person_id, to_person_id, amount_cents, source, note, raw, created_by)
          values (${a.personId}, ${user.personId}, ${a.amountCents}, 'tng', 'TNG 自动记录', ${text}, ${user.id})
          returning id`;
        paymentId = p.id;
      }
    }

    const status: IncomingStatus =
      a.outcome === "record" ? "recorded" : a.outcome === "pending" ? "pending" : a.outcome === "unparsed" ? "unparsed" : "ignored";
    const [row] = await tx`
      insert into incoming_payments
        (user_id, raw_text, sender_name, amount_cents, direction, status, reason, from_person_id, payment_id,
         verdict, verdict_kind, resolved_at)
      values (${user.id}, ${text}, ${a.sender}, ${a.amountCents}, ${a.direction}, ${status}, ${a.reason},
              ${a.personId}, ${paymentId}, ${a.verdict?.message ?? null}, ${a.verdict?.kind ?? null},
              ${status === "pending" ? null : new Date()})
      returning id`;

    let notify: IngestResult["notify"] = null;
    if (status === "recorded" && a.verdict && a.amountCents && !linkedManual) {
      const important = a.verdict.kind === "forgot_tax";
      if (notifyPayments || important) {
        notify = { ...recordedText(a.personName ?? "?", a.amountCents, a.verdict), url: "/inbox" };
      }
    } else if (status === "pending" && a.amountCents && a.reason) {
      // 看不出是收钱还是付钱、又没有名字的，不吵你，放在待确认就好
      const worthIt = a.direction === "in" || !!a.sender || !!a.personId;
      if (worthIt) {
        notify = {
          ...pendingText({ reason: a.reason, amount: a.amountCents, sender: a.sender, personName: a.personName, owed: a.owed }),
          url: "/inbox",
        };
      }
    }
    return { ...a, status, id: row.id as string, notify, linkedManual };
  });
}

// ---------- 待确认 / 撤销 ----------

export interface IncomingRow {
  id: string;
  rawText: string;
  senderName: string | null;
  amountCents: number | null;
  direction: Direction;
  status: IncomingStatus;
  reason: PendingReason | null;
  fromPersonId: string | null;
  personName: string | null;
  paymentId: string | null;
  verdict: string | null;
  verdictKind: string | null;
  receivedAt: string;
}

export async function listIncoming(userId: string): Promise<IncomingRow[]> {
  const sql = await db();
  const rows = await sql`
    select i.*, p.name as person_name
    from incoming_payments i left join people p on p.id = i.from_person_id
    where i.user_id = ${userId} and (i.status = 'pending' or i.received_at > now() - interval '30 days')
    order by i.received_at desc limit 200`;
  return rows.map((r) => ({
    id: r.id,
    rawText: r.raw_text,
    senderName: r.sender_name,
    amountCents: r.amount_cents,
    direction: r.direction,
    status: r.status,
    reason: r.reason,
    fromPersonId: r.from_person_id,
    personName: r.person_name,
    paymentId: r.payment_id,
    verdict: r.verdict,
    verdictKind: r.verdict_kind,
    receivedAt: (r.received_at as Date).toISOString(),
  }));
}

export async function pendingCount(userId: string): Promise<number> {
  const sql = await db();
  const [r] = await sql`select count(*)::int as n from incoming_payments where user_id = ${userId} and status = 'pending'`;
  return r.n;
}

export async function lastNoticeAt(userId: string): Promise<string | null> {
  const sql = await db();
  const [r] = await sql`select max(received_at) as at from incoming_payments where user_id = ${userId}`;
  return r.at ? (r.at as Date).toISOString() : null;
}

/** 选是谁转的，记下这笔（amountCents 不填 = 通知上的金额） */
export async function assignIncoming(user: SessionUser, id: string, personId: string, amountCents?: number | null) {
  const sql = await db();
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${`incoming:${user.id}`}))`;
    const [row] = await tx`select * from incoming_payments where id = ${id} and user_id = ${user.id} for update`;
    if (!row) throw new HttpError(404, "找不到这个通知");
    if (row.status === "recorded") throw new HttpError(409, "这笔已经记好了");
    if (personId === user.personId) throw new HttpError(400, "不能自己付给自己");
    const [person] = await tx`select id, name, tng_name from people where id = ${personId}`;
    if (!person) throw new HttpError(404, "找不到这个人");
    const amount = amountCents ?? row.amount_cents;
    if (!amount || amount <= 0) throw new HttpError(400, "这个通知没有金额，请用「记录收款」手动记");

    const w = await loadWorld(tx);
    const verdict = classifyPayment(amount, ledgerBetween(w, personId, user.personId));
    const [p] = await tx`
      insert into payments (from_person_id, to_person_id, amount_cents, paid_at, source, note, raw, created_by)
      values (${personId}, ${user.personId}, ${amount}, ${row.received_at}, 'tng', 'TNG（你确认的）', ${row.raw_text}, ${user.id})
      returning id`;
    await tx`
      update incoming_payments set status = 'recorded', from_person_id = ${personId}, payment_id = ${p.id},
        verdict = ${verdict.message}, verdict_kind = ${verdict.kind}, resolved_at = now()
      where id = ${id}`;

    // 记住这个 TNG 名字，下次自动认得
    if (row.sender_name) {
      const alias = normalizeName(row.sender_name);
      if (alias) {
        await tx`
          insert into tng_aliases (alias, person_id) values (${alias}, ${personId})
          on conflict (alias) do update set person_id = excluded.person_id, created_at = now()`;
      }
      if (!person.tng_name) await tx`update people set tng_name = ${row.sender_name} where id = ${personId}`;
    }
    return { verdict, name: person.name as string, amount };
  });
}

/** 不是朋友还钱（例如别的事），不记 */
export async function ignoreIncoming(user: SessionUser, id: string) {
  const sql = await db();
  const rows = await sql`
    update incoming_payments set status = 'ignored', resolved_at = now()
    where id = ${id} and user_id = ${user.id} and status in ('pending', 'unparsed') returning sender_name, reason`;
  if (rows.length === 0) throw new HttpError(404, "找不到这个通知");
  // 撤销过的自动记录又说「不是」：那个名字以前对错人了，忘掉它
  if (rows[0].reason === "undone" && rows[0].sender_name) {
    await sql`delete from tng_aliases where alias = ${normalizeName(rows[0].sender_name)}`;
  }
}

/** 自动记错了：删掉那笔付款，通知回到「待确认」 */
export async function undoIncoming(user: SessionUser, id: string) {
  const sql = await db();
  await sql.begin(async (tx) => {
    const [row] = await tx`select * from incoming_payments where id = ${id} and user_id = ${user.id} for update`;
    if (!row) throw new HttpError(404, "找不到这个通知");
    if (row.status !== "recorded") throw new HttpError(409, "这笔没有记录，不用撤销");
    if (row.payment_id) {
      // 接上的是你手动记的那一笔：只解开，不删
      const [pay] = await tx`select source from payments where id = ${row.payment_id}`;
      if (pay && pay.source === "tng") await tx`delete from payments where id = ${row.payment_id}`;
    }
    await tx`
      update incoming_payments set status = 'pending', reason = 'undone', payment_id = null,
        verdict = null, verdict_kind = null, resolved_at = null
      where id = ${id}`;
  });
}

/** 「试一试」：贴一段通知文字，看会怎么处理（不会记账） */
export async function testNotice(user: SessionUser, text: string) {
  const w = await loadWorld();
  const a = analyze(w, user, await loadAliases(), text);
  return { ...a, summary: describe(a) };
}

export function describe(a: Analysis): string {
  const amt = a.amountCents ? formatRM(a.amountCents) : null;
  switch (a.outcome) {
    case "record":
      return `会自动记录：${a.personName} 还你 ${amt}。${a.verdict?.message ?? ""}`;
    case "pending":
      switch (a.reason) {
        case "overpay":
          return `会放进「待确认」：${a.personName} 转 ${amt}，但他只欠你 ${formatRM(a.owed)}。`;
        case "no_debt":
          return `会放进「待确认」：${a.personName} 目前没有欠你钱。`;
        case "tied":
          return `会放进「待确认」：「${a.sender}」对上不只一个朋友，要你选。`;
        case "unsure":
          return `会放进「待确认」：看不出是收钱还是付钱（${a.personName}，${amt}）。`;
        default:
          return a.sender
            ? `会放进「待确认」：收到 ${amt}，但「${a.sender}」对不上朋友。选一次之后就会自动认得。`
            : `会放进「待确认」：收到 ${amt}，但看不到是谁转的。`;
      }
    case "unparsed":
      return "看不到金额，不会记录。";
    case "ignore":
      return a.direction === "out" ? "这是你付钱出去的通知，不会记录。" : "这不是朋友转账（例如 cashback、reload、广告），不会记录。";
  }
}

// ---------- 捷径传来空的内容（第 6 步没设好）：记下时间，设定教学页会提醒 ----------

export async function markEmptyHook(userId: string) {
  const sql = await db();
  await sql`
    insert into app_settings (key, value) values (${`hook_empty:${userId}`}, ${new Date().toISOString()})
    on conflict (key) do update set value = excluded.value`;
}

export async function lastEmptyHookAt(userId: string): Promise<string | null> {
  const sql = await db();
  const [r] = await sql<{ value: string }[]>`select value from app_settings where key = ${`hook_empty:${userId}`}`;
  return r?.value ?? null;
}
