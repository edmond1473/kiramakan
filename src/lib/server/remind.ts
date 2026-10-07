import "server-only";
import { db } from "./db";
import { balancesFor, billView, loadWorld, type World } from "./world";
import { DEFAULT_TOLERANCE_CENTS } from "../ledger";
import { reminderText, type DebtorReminder, type ReminderData, type UnclaimedReminder } from "../remind";
import { sendPush, type PushResult } from "./push";

const tol = DEFAULT_TOLERANCE_CENTS;

/** 某人在某一餐吃的 item，例如「Nasi Lemak」「Pizza 1/3」 */
function itemsEaten(w: World, billId: string, personId: string): string[] {
  const alloc = w.alloc.get(billId);
  const out: string[] = [];
  for (const it of w.itemsByBill.get(billId) ?? []) {
    const share = (w.sharesByItem.get(it.id) ?? []).find((s) => s.personId === personId);
    if (!share) continue;
    const denom = alloc?.items.get(it.id)?.denom ?? 1;
    out.push(share.units < denom ? `${it.name} ${share.units}/${denom}` : it.name);
  }
  return out;
}

/** 谁还欠你（吃了什么）、谁少给 tax、哪些 item 没人认领 */
export function reminderData(w: World, personId: string, pendingIncoming: number): ReminderData {
  const name = (id: string) => w.people.get(id)?.name ?? "?";
  const debtors: DebtorReminder[] = balancesFor(w, personId)
    .receivables.filter((r) => r.ledger.balance > tol)
    .map((r) => ({
      personId: r.debtorId,
      name: name(r.debtorId),
      owed: r.ledger.balance,
      forgotTax: r.openCharges.filter((c) => c.status === "forgot_tax").reduce((s, c) => s + c.remaining, 0),
      bills: r.openCharges.map((c) => ({
        billId: c.billId,
        title: w.billById.get(c.billId)?.title ?? "?",
        billDate: c.billDate,
        remaining: c.remaining,
        status: c.status,
        items: itemsEaten(w, c.billId, r.debtorId),
      })),
    }));

  const unclaimed: UnclaimedReminder[] = [];
  for (const b of w.bills) {
    if (b.payerPersonId !== personId) continue;
    const a = w.alloc.get(b.id);
    if (!a || a.unassigned.owed <= tol) continue;
    const v = billView(w, b.id);
    if (!v) continue;
    unclaimed.push({
      billId: b.id,
      title: b.title,
      billDate: b.billDate,
      owed: a.unassigned.owed,
      items: v.items.filter((i) => i.unassignedCents > 0).map((i) => ({ name: i.name, cents: i.unassignedCents })),
      notPicked: v.participants.filter((p) => !p.isPayer && p.owed <= 0).map((p) => p.name),
    });
  }

  return {
    debtors,
    unclaimed,
    pendingIncoming,
    totalOwed: debtors.reduce((s, d) => s + d.owed, 0),
  };
}

async function pendingCounts(): Promise<Map<string, number>> {
  const sql = await db();
  const rows = await sql<{ user_id: string; n: number }[]>`
    select user_id, count(*)::int as n from incoming_payments where status = 'pending' group by user_id`;
  return new Map(rows.map((r) => [r.user_id, r.n]));
}

/** 马上发一次提醒（设定页的「现在提醒我」） */
export async function remindNow(user: { id: string; personId: string }): Promise<PushResult & { empty: boolean }> {
  const w = await loadWorld();
  const data = reminderData(w, user.personId, (await pendingCounts()).get(user.id) ?? 0);
  const text = reminderText(data);
  const payload = text
    ? { ...text, url: "/remind", tag: "remind" }
    : { title: "没有人欠你钱 ✓", body: "全部都还清了，也没有没人认领的 item。", url: "/", tag: "remind" };
  const r = await sendPush(user.id, payload);
  return { ...r, empty: !text };
}

/** 每天的 cron：到时间的人才发（每天 / 每两天），没有东西要提醒就不发 */
export async function runScheduledReminders(now = new Date()) {
  const sql = await db();
  const users = await sql<{ id: string; person_id: string; remind_every: number; remind_last_at: Date | null }[]>`
    select u.id, u.person_id, u.remind_every, u.remind_last_at from users u
    where u.remind_every > 0 and exists (select 1 from push_subscriptions s where s.user_id = u.id)`;
  const out: { userId: string; result: string }[] = [];
  if (users.length > 0) {
    const w = await loadWorld();
    const pending = await pendingCounts();
    for (const u of users) {
      // cron 在那一个小时里任何时间都可能跑，所以留 6 小时的余地
      const dueMs = u.remind_every * 24 * 3600_000 - 6 * 3600_000;
      if (u.remind_last_at && now.getTime() - u.remind_last_at.getTime() < dueMs) {
        out.push({ userId: u.id, result: "not_due" });
        continue;
      }
      const text = reminderText(reminderData(w, u.person_id, pending.get(u.id) ?? 0));
      if (!text) {
        out.push({ userId: u.id, result: "nothing" });
        continue;
      }
      const r = await sendPush(u.id, { ...text, url: "/remind", tag: "remind" });
      if (r.sent > 0) await sql`update users set remind_last_at = ${now} where id = ${u.id}`;
      out.push({ userId: u.id, result: `sent ${r.sent}/${r.devices}` });
    }
  }
  // 不是转账的通知只留 60 天
  await sql`delete from incoming_payments where status in ('ignored', 'unparsed') and received_at < now() - interval '60 days'`;
  return out;
}

export interface NotifySettings {
  remindEvery: number;
  notifyPayments: boolean;
  remindLastAt: string | null;
}

export async function notifySettings(userId: string): Promise<NotifySettings> {
  const sql = await db();
  const [r] = await sql`select remind_every, notify_payments, remind_last_at from users where id = ${userId}`;
  return {
    remindEvery: r?.remind_every ?? 2,
    notifyPayments: r?.notify_payments ?? true,
    remindLastAt: r?.remind_last_at ? (r.remind_last_at as Date).toISOString() : null,
  };
}
