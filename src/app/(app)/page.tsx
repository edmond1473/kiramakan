import { Plus, ReceiptText } from "lucide-react";
import { pageUser } from "@/lib/server/auth";
import { balancesFor, billView, loadWorld } from "@/lib/server/world";
import { Avatar, Empty, Group, LinkButton, Money, PageHeader, Row, daysSince, formatDate, formatDateShort } from "@/components/ui";
import { formatRM } from "@/lib/money";

function agoLabel(days: number): string {
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  return ` ${days} 天前`;
}

export default async function Home() {
  const me = await pageUser();
  const w = await loadWorld();
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

  return (
    <main>
      <PageHeader
        title="账本"
        action={
          <LinkButton href="/bills/new" variant="filled" size="sm">
            <Plus className="size-4" strokeWidth={2.5} /> 新增一餐
          </LinkButton>
        }
      />

      <div className="px-4">
        <section className="mt-4 rounded-xl bg-surface p-4">
          {totalOwedToMe > 0 ? (
            <>
              <p className="text-[15px] leading-5 text-label-2">别人还欠你</p>
              <p className="tabular mt-1 text-[34px] leading-[40px] font-bold tracking-[-0.01em]">{formatRM(totalOwedToMe)}</p>
              <p className="mt-1 text-[13px] leading-[18px] text-label-2">
                {owedToMe.length} 个人还没还清
                {oldest && ` · 最早一笔是${agoLabel(daysSince(oldest))}`}
              </p>
            </>
          ) : (
            <>
              <p className="text-[17px] leading-6 font-semibold">大家都还清了 ✓</p>
              <p className="mt-1 text-[13px] leading-[18px] text-label-2">没有人欠你钱。</p>
            </>
          )}
          {totalIOwe > 0 && (
            <p className="mt-3 border-t border-separator pt-3 text-[14px] leading-5">
              你欠别人 <Money cents={totalIOwe} className="font-semibold" />
            </p>
          )}
        </section>

        {owedToMe.length > 0 && (
          <Group title="还没还你的">
            {owedToMe.map((r) => {
              const forgotTax = r.openCharges.some((c) => c.status === "forgot_tax");
              const first = r.openCharges[0]?.billDate;
              return (
                <Row
                  key={r.debtorId}
                  href={`/people/${r.debtorId}`}
                  leading={<Avatar name={name(r.debtorId)} />}
                  trailing={<Money cents={r.ledger.balance} className="text-[15px] font-semibold" />}
                  chevron
                >
                  <p className="truncate text-[15px] leading-5 font-semibold">{name(r.debtorId)}</p>
                  <p className="mt-0.5 truncate text-[13px] leading-[18px] text-label-2">
                    {r.openCharges.length} 餐{first && ` · 最早 ${formatDateShort(first)}`}
                    {forgotTax && <span className="text-orange-text"> · 忘了 tax</span>}
                  </p>
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
                  trailing={<Money cents={p.ledger.balance} className="text-[15px] font-semibold" />}
                  chevron
                >
                  <p className="truncate text-[15px] leading-5 font-semibold">{name(p.creditorId)}</p>
                  <p className="mt-0.5 truncate text-[13px] leading-[18px] text-label-2">
                    {p.ledger.balance < 0 ? "你多给了" : `${p.openCharges.length} 餐`}
                    {mutual && <span className="text-tint-text"> · 可以互抵</span>}
                  </p>
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
                trailing={<Money cents={-r.ledger.balance} className="text-[15px] font-semibold" />}
                chevron
              >
                <p className="truncate text-[15px] leading-5 font-semibold">{name(r.debtorId)}</p>
              </Row>
            ))}
          </Group>
        )}

        {recent.length > 0 ? (
          <Group title="最近的单">
            {recent.map((b) => {
              const debtors = b.participants.filter((p) => !p.isPayer && p.owed > 0);
              const paid = debtors.filter((p) => p.status === "paid").length;
              return (
                <Row key={b.id} href={`/bills/${b.id}`} chevron trailing={<Money cents={b.totalCents} className="text-[15px]" />}>
                  <p className="truncate text-[15px] leading-5 font-semibold">{b.title}</p>
                  <p className="mt-0.5 truncate text-[13px] leading-[18px] text-label-2">
                    {formatDate(b.billDate)} · {b.payer.personId === me.personId ? "你付的" : `${b.payer.name} 付的`}
                    {debtors.length > 0 &&
                      (paid === debtors.length ? (
                        <span className="text-green-text"> · 全部已付</span>
                      ) : (
                        <> · {paid}/{debtors.length} 已付</>
                      ))}
                    {b.unassigned.owed > 0 && <span className="text-orange-text"> · 还有 item 没人认领</span>}
                  </p>
                </Row>
              );
            })}
            {w.bills.length > recent.length && (
              <Row href="/bills" chevron>
                <span className="text-[15px] text-tint-text">看全部 {w.bills.length} 张单</span>
              </Row>
            )}
          </Group>
        ) : (
          <Empty icon={<ReceiptText className="size-11" strokeWidth={1.5} />} title="还没有账单">
            按右上角「新增一餐」，拍下 receipt 就开始。
          </Empty>
        )}
      </div>
    </main>
  );
}
