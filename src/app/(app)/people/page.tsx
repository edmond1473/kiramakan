import type { Metadata } from "next";
import { Users } from "lucide-react";
import { pageUser } from "@/lib/server/auth";
import { ledgerBetween, loadWorld } from "@/lib/server/world";
import { isSettled } from "@/lib/ledger";
import { Avatar, Empty, Group, Money, PageHeader, Row, Tag } from "@/components/ui";
import { AddFriendButton } from "./AddFriendButton";

export const metadata: Metadata = { title: "朋友" };

export default async function PeoplePage() {
  const me = await pageUser();
  const w = await loadWorld();
  const rows = [...w.people.values()]
    .filter((p) => p.isActive && p.id !== me.personId)
    .map((p) => {
      const theyOwe = ledgerBetween(w, p.id, me.personId).balance;
      const iOwe = ledgerBetween(w, me.personId, p.id).balance;
      return { p, net: theyOwe - iOwe };
    })
    .sort((a, b) => b.net - a.net || a.p.name.localeCompare(b.p.name));

  return (
    <main>
      <PageHeader title="朋友" action={<AddFriendButton />} />
      <div className="px-4">
        {rows.length === 0 ? (
          <Empty icon={<Users className="size-12" strokeWidth={1.75} />} title="还没有朋友">
            新增账单时打名字，或按右上角「加朋友」。
          </Empty>
        ) : (
          <Group footer="TNG 名字是朋友转账时 TNG 显示的名字，之后自动对账会用到。">
            {rows.map(({ p, net }) => (
              <Row
                key={p.id}
                href={`/people/${p.id}`}
                leading={<Avatar name={p.name} />}
                chevron
                trailing={
                  isSettled(net) ? (
                    <Tag tone="mist">已结清</Tag>
                  ) : net > 0 ? (
                    <div className="text-right">
                      <p className="label-mono text-label-2">欠你</p>
                      <Money cents={net} className="text-[16px] font-semibold" />
                    </div>
                  ) : (
                    <div className="text-right">
                      <p className="label-mono text-label-2">你欠</p>
                      <Money cents={-net} className="text-[16px] font-semibold" />
                    </div>
                  )
                }
              >
                <p className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[16px] leading-[21px] font-semibold">{p.name}</span>
                  {p.userId && <Tag tone="outline">付钱的人</Tag>}
                </p>
                <p className="mt-0.5 truncate text-[13px] leading-[18px] text-label-2">
                  {p.tngName ? `TNG：${p.tngName}` : "还没填 TNG 名字"}
                </p>
              </Row>
            ))}
          </Group>
        )}
      </div>
    </main>
  );
}
