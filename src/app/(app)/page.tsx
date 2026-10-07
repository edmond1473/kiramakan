import type { Viewport } from "next";
import { ArrowRight, BellRing, Check, Plus } from "lucide-react";
import Link from "next/link";
import { pageUser } from "@/lib/server/auth";
import { balancesFor, billView, loadWorld } from "@/lib/server/world";
import { lastNoticeAt, pendingCount } from "@/lib/server/incoming";
import { deviceCount } from "@/lib/server/push";
import {
  Avatar,
  BigMoney,
  Group,
  Hero,
  LinkButton,
  Money,
  Row,
  Squiggle,
  Tag,
  daysSince,
  formatDate,
  formatDateShort,
} from "@/components/ui";

export const viewport: Viewport = { themeColor: "#fff100" };

function agoLabel(days: number): string {
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  return ` ${days} 天前`;
}

export default async function Home() {
  const me = await pageUser();
  const [w, pending, devices, lastNotice] = await Promise.all([
    loadWorld(),
    pendingCount(me.id),
    deviceCount(me.id),
    lastNoticeAt(me.id),
  ]);
  const { receivables, payables } = balancesFor(w, me.personId);
  const owedToMe = receivables.filter((r) => r.ledger.balance > 0);
  const credits = receivables.filter((r) => r.ledger.balance < 0);
  const totalOwedToMe = owedToMe.reduce((s, r) => s + r.ledger.balance, 0);
  const totalIOwe = payables.filter((p) => p.ledger.balance > 0).reduce((s, p) => s + p.ledger.balance, 0);
  const oldest = owedToMe
    .flatMap((r) => r.openCharges.map((c) => c.billDate))
    .sort()[0];
  const recent = w.bills.slice(0, 12).map((b) => billView(w, b.id)!);
  const name = (id: string) => w.people.get(id)?.name ?? "?";
  const noBills = w.bills.length === 0;

  return (
    <main>
      <h1 className="sr-only">账本</h1>
      <Hero className="pt-[max(10px,env(safe-area-inset-top))]">
        <div className="flex h-12 items-center justify-between gap-3">
          <span className="display text-[22px] tracking-[-0.035em]">KiraMakan</span>
          <span className="label-mono truncate opacity-70">{me.name}</span>
        </div>

        {totalOwedToMe > 0 ? (
          <>
            <p className="label-mono mt-9">别人还欠你</p>
            <div className="relative mt-3 inline-block">
              <BigMoney cents={totalOwedToMe} className="text-[68px] leading-[0.86]" />
              <Squiggle className="absolute inset-x-0 -bottom-4 w-full" />
            </div>
            <p className="mt-7 text-[15px] leading-[22px]">
              {owedToMe.length} 个人还没还清{oldest && `，最早一笔是${agoLabel(daysSince(oldest))}`}。
            </p>
          </>
        ) : noBills ? (
          <>
            <p className="label-mono mt-9">还没有账单</p>
            <p className="display mt-3 text-[52px] leading-[0.95]">第一餐从这里开始</p>
            <p className="mt-4 max-w-[30ch] text-[15px] leading-[22px]">拍下 receipt，AI 会拆好每个 item，tax 自动摊给每个人。</p>
          </>
        ) : (
          <>
            <p className="label-mono mt-9">别人还欠你</p>
            <p className="display mt-3 text-[52px] leading-[0.95]">大家都还清了</p>
            <p className="mt-4 text-[15px] leading-[22px]">没有人欠你钱。</p>
          </>
        )}
        {totalIOwe > 0 && (
          <p className="mt-1.5 text-[15px] leading-[22px]">
            你欠别人 <Money cents={totalIOwe} className="font-semibold" />。
          </p>
        )}

        <LinkButton href="/bills/new" variant="ink" size="lg" full className="mt-7">
          <Plus className="size-5" strokeWidth={2.5} aria-hidden /> 新增一餐
        </LinkButton>
      </Hero>

      <div className="px-4">
        {pending > 0 && (
          <Link href="/inbox" className="press on-color mt-6 flex items-center gap-3 rounded-[24px] bg-flare p-4 text-ink">
            <BellRing className="size-6 shrink-0" strokeWidth={2} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] leading-[21px] font-semibold">{pending} 笔 TNG 进账要你确认</p>
              <p className="mt-0.5 text-[13px] leading-[18px]">按这里看是谁转的、要不要记。</p>
            </div>
            <ArrowRight className="size-5 shrink-0" strokeWidth={2.25} aria-hidden />
          </Link>
        )}

        {!noBills && (devices === 0 || !lastNotice) && (
          <section className="card mt-6 rounded-[24px] bg-surface p-5">
            <p className="label-mono text-label-2">自动记账还没设定好</p>
            <ul className="mt-3 space-y-1">
              {[
                { done: devices > 0, href: "/settings", text: "开手机通知", hint: "朋友转钱、谁还没还会通知你" },
                { done: !!lastNotice, href: "/settings/tng-setup", text: "iPhone 设定", hint: "收到 TNG 的钱自动记账" },
              ].map((x) => (
                <li key={x.href}>
                  <Link href={x.href} className="-mx-2 flex items-center gap-3 rounded-[16px] px-2 py-2 active:bg-fill">
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full ${x.done ? "bg-forest text-white" : "border-[1.5px] border-label-3"}`}
                    >
                      {x.done && <Check className="size-4" strokeWidth={3} aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[15px] leading-5 font-semibold ${x.done ? "text-label-3 line-through" : ""}`}>{x.text}</span>
                      <span className="block text-[12px] leading-4 text-label-2">{x.hint}</span>
                    </span>
                    {!x.done && <ArrowRight className="size-4 shrink-0 text-label-3" strokeWidth={2} aria-hidden />}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {owedToMe.length > 0 && (
          <Group
            title="还没还你的"
            action={
              <Link href="/remind" className="label-mono inline-flex items-center gap-1 text-label underline-offset-4 active:opacity-60">
                谁吃了什么 <ArrowRight className="size-3.5" strokeWidth={2.5} aria-hidden />
              </Link>
            }
          >
            {owedToMe.map((r) => {
              const forgotTax = r.openCharges.some((c) => c.status === "forgot_tax");
              const first = r.openCharges[0]?.billDate;
              return (
                <Row
                  key={r.debtorId}
                  href={`/people/${r.debtorId}`}
                  leading={<Avatar name={name(r.debtorId)} />}
                  trailing={<Money cents={r.ledger.balance} className="text-[16px] font-semibold" />}
                  chevron
                >
                  <p className="truncate text-[16px] leading-[21px] font-semibold">{name(r.debtorId)}</p>
                  <div className="mt-1 flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13px] leading-[18px] text-label-2">
                      {r.openCharges.length} 餐{first && ` · 最早 ${formatDateShort(first)}`}
                    </span>
                    {forgotTax && <Tag tone="flare">忘了 tax</Tag>}
                  </div>
                </Row>
              );
            })}
          </Group>
        )}

        {payables.length > 0 && (
          <Group title="你欠的" footer="你跟对方互相都有欠的话，可以在对方的页面按「互抵」。">
            {payables.map((p) => {
              const mutual = receivables.some((r) => r.debtorId === p.creditorId && r.ledger.balance > 0);
              return (
                <Row
                  key={p.creditorId}
                  href={`/people/${p.creditorId}`}
                  leading={<Avatar name={name(p.creditorId)} />}
                  trailing={<Money cents={p.ledger.balance} className="text-[16px] font-semibold" />}
                  chevron
                >
                  <p className="truncate text-[16px] leading-[21px] font-semibold">{name(p.creditorId)}</p>
                  <div className="mt-1 flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13px] leading-[18px] text-label-2">
                      {p.ledger.balance < 0 ? "你多给了" : `${p.openCharges.length} 餐`}
                    </span>
                    {mutual && <Tag tone="indigo">可以互抵</Tag>}
                  </div>
                </Row>
              );
            })}
          </Group>
        )}

        {credits.length > 0 && (
          <Group title="多给了你的" footer="下次他们有新的账，会自动先扣掉。">
            {credits.map((r) => (
              <Row
                key={r.debtorId}
                href={`/people/${r.debtorId}`}
                leading={<Avatar name={name(r.debtorId)} />}
                trailing={<Money cents={-r.ledger.balance} className="text-[16px] font-semibold" />}
                chevron
              >
                <p className="truncate text-[16px] leading-[21px] font-semibold">{name(r.debtorId)}</p>
              </Row>
            ))}
          </Group>
        )}

        {recent.length > 0 && (
          <Group
            title="最近的单"
            action={
              w.bills.length > recent.length ? (
                <Link href="/bills" className="label-mono inline-flex items-center gap-1 text-label underline-offset-4 active:opacity-60">
                  全部 {w.bills.length} 张 <ArrowRight className="size-3.5" strokeWidth={2.5} aria-hidden />
                </Link>
              ) : null
            }
          >
            {recent.map((b) => {
              const debtors = b.participants.filter((p) => !p.isPayer && p.owed > 0);
              const paid = debtors.filter((p) => p.status === "paid").length;
              return (
                <Row key={b.id} href={`/bills/${b.id}`} chevron trailing={<Money cents={b.totalCents} className="text-[16px] font-semibold" />}>
                  <p className="truncate text-[16px] leading-[21px] font-semibold">{b.title}</p>
                  <p className="mt-0.5 truncate text-[13px] leading-[18px] text-label-2">
                    {formatDate(b.billDate)} · {b.payer.personId === me.personId ? "你付的" : `${b.payer.name} 付的`}
                  </p>
                  {(debtors.length > 0 || b.unassigned.owed > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {debtors.length > 0 &&
                        (paid === debtors.length ? (
                          <Tag tone="forest">全部已付 ✓</Tag>
                        ) : (
                          <Tag tone="mist">
                            {paid}/{debtors.length} 已付
                          </Tag>
                        ))}
                      {b.unassigned.owed > 0 && <Tag tone="volt">有 item 没人认领</Tag>}
                    </div>
                  )}
                </Row>
              );
            })}
          </Group>
        )}
      </div>
    </main>
  );
}
