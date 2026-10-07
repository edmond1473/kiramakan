import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { pageUser } from "@/lib/server/auth";
import { billView, loadWorld } from "@/lib/server/world";
import { Group, LinkButton, Money, PageHeader, Row, Tag, formatDate } from "@/components/ui";

export const metadata: Metadata = { title: "全部账单" };

export default async function AllBillsPage() {
  const me = await pageUser();
  const w = await loadWorld();
  const views = w.bills.map((b) => billView(w, b.id)!);
  // 按月份分组
  const months = new Map<string, typeof views>();
  for (const v of views) {
    const key = v.billDate.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), v]);
  }
  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
  };
  return (
    <main>
      <PageHeader
        title="全部账单"
        back={{ href: "/", label: "账本" }}
        subtitle={`${views.length} 张单`}
        action={
          <LinkButton href="/bills/new" variant="filled" size="sm">
            <Plus className="size-4" strokeWidth={2.5} aria-hidden /> 新增
          </LinkButton>
        }
      />
      <div className="px-4 pb-6">
        {[...months.entries()].map(([ym, list]) => (
          <Group key={ym} title={`${monthLabel(ym)} · ${list.length} 张`}>
            {list.map((b) => {
              const debtors = b.participants.filter((p) => !p.isPayer && p.owed > 0);
              const paid = debtors.filter((p) => p.status === "paid").length;
              return (
                <Row key={b.id} href={`/bills/${b.id}`} chevron trailing={<Money cents={b.totalCents} className="text-[16px] font-semibold" />}>
                  <p className="truncate text-[16px] leading-[21px] font-semibold">{b.title}</p>
                  <p className="mt-0.5 truncate text-[13px] leading-[18px] text-label-2">
                    {formatDate(b.billDate)} · {b.payer.personId === me.personId ? "你付的" : `${b.payer.name} 付的`}
                  </p>
                  {debtors.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {paid === debtors.length ? (
                        <Tag tone="forest">全部已付 ✓</Tag>
                      ) : (
                        <Tag tone="mist">
                          {paid}/{debtors.length} 已付
                        </Tag>
                      )}
                    </div>
                  )}
                </Row>
              );
            })}
          </Group>
        ))}
      </div>
    </main>
  );
}
