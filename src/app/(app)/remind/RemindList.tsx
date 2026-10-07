"use client";

import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { formatRM } from "@/lib/money";
import type { DebtorReminder, ReminderData, UnclaimedReminder } from "@/lib/remind";
import { waLink } from "@/lib/wa";
import {
  Avatar,
  BigMoney,
  Empty,
  Group,
  LinkButton,
  Money,
  PageHeader,
  StatusChip,
  Tag,
  buttonClass,
  formatDateShort,
} from "@/components/ui";
import { useOrigin } from "@/components/ui-client";

export function RemindList({
  data,
  myName,
  contacts,
  shareTokens,
}: {
  data: ReminderData;
  myName: string;
  contacts: Record<string, { token: string; phone: string | null }>;
  shareTokens: Record<string, string>;
}) {
  const origin = useOrigin();
  const taxShort = data.debtors.filter((d) => d.forgotTax > 0);
  const clear = data.debtors.length === 0 && data.unclaimed.length === 0;

  return (
    <main>
      <PageHeader
        title="谁还没还"
        back={{ href: "/", label: "账本" }}
        subtitle={
          data.debtors.length > 0 ? (
            <>
              {data.debtors.length} 个人还欠你 <Money cents={data.totalOwed} className="font-semibold text-label" />
              {taxShort.length > 0 && `，${taxShort.length} 个人少给了 tax`}。
            </>
          ) : undefined
        }
      />
      <div className="px-4">
        {data.pendingIncoming > 0 && (
          <Link
            href="/inbox"
            className="press on-color mt-6 flex items-center gap-3 rounded-[24px] bg-flare p-4 text-ink"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[16px] leading-[21px] font-semibold">{data.pendingIncoming} 笔 TNG 进账要你确认</p>
              <p className="mt-0.5 text-[13px] leading-[18px]">不知道是谁转的。确认之后，下面的欠款会跟着更新。</p>
            </div>
            <ArrowRight className="size-5 shrink-0" strokeWidth={2.25} aria-hidden />
          </Link>
        )}

        {clear && (
          <Empty title="大家都还清了 ✓">
            <p>没有人欠你钱，也没有没人认领的 item。</p>
          </Empty>
        )}

        {data.debtors.length > 0 && (
          <section className="mt-8">
            <h2 className="label-mono mb-2.5 px-1 text-label-2">还没还的（{data.debtors.length}）</h2>
            <div className="space-y-3">
              {data.debtors.map((d) => (
                <DebtorCard key={d.personId} d={d} myName={myName} contact={contacts[d.personId]} origin={origin} />
              ))}
            </div>
          </section>
        )}

        {taxShort.length > 0 && (
          <Group title="少给了 tax 的" footer="他们转的钱刚好等于 item 的价钱，没有加 tax / service charge。">
            {taxShort.map((d) => (
              <div key={d.personId} className="row border-b border-separator px-5 py-3.5 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[16px] leading-[21px] font-semibold">{d.name}</p>
                  <Tag tone="flare">还差 {formatRM(d.forgotTax)}</Tag>
                </div>
                <p className="mt-1 text-[13px] leading-[18px] text-label-2">
                  {d.bills
                    .filter((b) => b.status === "forgot_tax")
                    .map((b) => `${b.title}（${formatDateShort(b.billDate)}）`)
                    .join("、")}
                </p>
              </div>
            ))}
          </Group>
        )}

        {data.unclaimed.length > 0 && (
          <section className="mt-8">
            <h2 className="label-mono mb-2.5 px-1 text-label-2">没人认领的 item</h2>
            <div className="space-y-3">
              {data.unclaimed.map((u) => (
                <UnclaimedCard key={u.billId} u={u} origin={origin} shareToken={shareTokens[u.billId]} />
              ))}
            </div>
            <p className="mt-2.5 px-1 text-[12px] leading-[17px] text-label-2">
              没人认领的 item 没有人会付。叫有吃的人去 link 点一下，或在账单页按「让大家平分」。你自己吃的也要分给自己，不然会一直算没人认领。
            </p>
          </section>
        )}
        <div className="h-6" />
      </div>
    </main>
  );
}

function debtorMessage(d: DebtorReminder, myName: string, url: string): string {
  const lines = d.bills.map((b) => {
    const what = b.items.length > 0 ? `：${b.items.join("、")}` : "";
    const tax = b.status === "forgot_tax" ? "（少给了 tax）" : "";
    return `· ${b.title}（${formatDateShort(b.billDate)}）${formatRM(b.remaining)}${tax}${what}`;
  });
  return `Hi ${d.name}，提醒一下：你还欠 ${myName} ${formatRM(d.owed)}。\n${lines.join("\n")}\n明细和付款方式：${url}`;
}

function DebtorCard({
  d,
  myName,
  contact,
  origin,
}: {
  d: DebtorReminder;
  myName: string;
  contact: { token: string; phone: string | null } | undefined;
  origin: string;
}) {
  const url = contact ? `${origin}/p/${contact.token}` : origin;
  return (
    <article className="card rounded-[24px] bg-surface p-5">
      <div className="flex items-center gap-3">
        <Avatar name={d.name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[18px] leading-6 font-semibold">{d.name}</p>
          <p className="text-[13px] leading-[18px] text-label-2">
            {d.bills.length} 餐{d.forgotTax > 0 && " · 有少给 tax"}
          </p>
        </div>
        <BigMoney cents={d.owed} className="text-[30px] leading-none" />
      </div>
      <ul className="mt-4 space-y-3 border-t border-separator pt-4">
        {d.bills.map((b) => (
          <li key={b.billId}>
            <Link href={`/bills/${b.billId}`} className="block active:opacity-60">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-[15px] leading-5 font-semibold">
                  {b.title} <span className="font-normal text-label-2">· {formatDateShort(b.billDate)}</span>
                </p>
                <Money cents={b.remaining} className="text-[15px] font-semibold" />
              </div>
              {b.items.length > 0 && (
                <p className="mt-0.5 text-[13px] leading-[18px] text-label-2">吃了：{b.items.join("、")}</p>
              )}
              <div className="mt-1.5">
                <StatusChip status={b.status} remaining={b.remaining} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={waLink(contact?.phone ?? null, debtorMessage(d, myName, url))}
          target="_blank"
          rel="noreferrer"
          className={buttonClass("tinted", "md", true)}
        >
          <MessageCircle className="size-[18px]" strokeWidth={2.25} /> 催他
        </a>
        <LinkButton href={`/people/${d.personId}`} variant="gray" full>
          记录收款
        </LinkButton>
      </div>
    </article>
  );
}

function UnclaimedCard({ u, origin, shareToken }: { u: UnclaimedReminder; origin: string; shareToken: string | undefined }) {
  const url = shareToken ? `${origin}/b/${shareToken}` : origin;
  const text = `「${u.title}」（${formatDateShort(u.billDate)}）还有这些没人认领：${u.items
    .map((i) => i.name)
    .join("、")}。有吃的请去 link 点一下：\n${url}`;
  return (
    <article className="card rounded-[24px] bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] leading-[22px] font-semibold">{u.title}</p>
          <p className="mt-0.5 text-[13px] leading-[18px] text-label-2">{formatDateShort(u.billDate)} · 你会少收（含 tax）</p>
        </div>
        <BigMoney cents={u.owed} className="text-[26px] leading-none" />
      </div>
      <ul className="mt-3.5 space-y-1.5 border-t border-separator pt-3.5 text-[14px] leading-5">
        {u.items.map((i, n) => (
          <li key={n} className="flex justify-between gap-3">
            <span className="min-w-0">{i.name}</span>
            <Money cents={i.cents} className="text-label-2" />
          </li>
        ))}
      </ul>
      {u.notPicked.length > 0 && (
        <p className="mt-3 text-[13px] leading-[18px]">
          <span className="text-label-2">还没点的人：</span>
          <span className="font-semibold">{u.notPicked.join("、")}</span>
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={waLink(null, text)} target="_blank" rel="noreferrer" className={buttonClass("tinted", "md", true)}>
          <MessageCircle className="size-[18px]" strokeWidth={2.25} /> 发去 group
        </a>
        <LinkButton href={`/bills/${u.billId}`} variant="gray" full>
          打开账单
        </LinkButton>
      </div>
    </article>
  );
}
