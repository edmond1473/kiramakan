import type { Metadata } from "next";
import { pageUser } from "@/lib/server/auth";
import { loadWorld } from "@/lib/server/world";
import { NewBillFlow } from "./NewBillFlow";
import { todayMY } from "@/components/ui";

export const metadata: Metadata = { title: "新增一餐" };

export default async function NewBillPage() {
  const me = await pageUser();
  const w = await loadWorld();
  // 常一起吃的人排前面
  const freq = new Map<string, number>();
  for (const ids of w.participantsByBill.values()) for (const id of ids) freq.set(id, (freq.get(id) ?? 0) + 1);
  const people = [...w.people.values()]
    .filter((p) => p.isActive)
    .sort((a, b) => (freq.get(b.id) ?? 0) - (freq.get(a.id) ?? 0) || a.name.localeCompare(b.name))
    .map((p) => ({ id: p.id, name: p.name, isPayer: !!p.userId }));
  return <NewBillFlow me={{ personId: me.personId, name: me.name }} people={people} today={todayMY()} />;
}
