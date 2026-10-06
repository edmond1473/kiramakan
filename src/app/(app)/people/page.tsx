import type { Metadata } from "next";
import { Users } from "lucide-react";
import { pageUser } from "@/lib/server/auth";
import { ledgerBetween, loadWorld } from "@/lib/server/world";
import { isSettled } from "@/lib/ledger";
import { Avatar, Empty, Group, Money, PageHeader, Row } from "@/components/ui";
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
          <Empty icon={<Users className="size-11" strokeWidth={1.5} />} title="还没有朋友">
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
                    <span className="text-[13px] text-label-3">已结清</span>
                  ) : net > 0 ? (
                    <div className="text-right">
                      <p className="text-[12px] leading-4 text-label-2">欠你</p>
                      <Money cents={net} className="text-[15px] font-semibold" />
                    </div>
                  ) : (
                    <div className="text-right">
                      <p className="text-[12px] leading-4 text-label-2">你欠</p>
                      <Money cents={-net} className="text-[15px] font-semibold" />
                    </div>
                  )
                }
              >
                <p className="truncate text-[15px] leading-5 font-semibold">
                  {p.name}
                  {p.userId && <span className="ml-1.5 text-[12px] font-medium text-label-2">付钱的人</span>}
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
