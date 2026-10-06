import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageUser } from "@/lib/server/auth";
import { billView, loadWorld } from "@/lib/server/world";
import { BillAdmin } from "./BillAdmin";

export const metadata: Metadata = { title: "账单" };

export default async function BillPage(props: PageProps<"/bills/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const me = await pageUser();
  const w = await loadWorld();
  const view = billView(w, id);
  if (!view) notFound();
  const people = [...w.people.values()].filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }));
  return (
    <BillAdmin
      initialView={view}
      people={people}
      me={{ personId: me.personId, name: me.name, isAdmin: me.isAdmin }}
      justCreated={sp.new === "1"}
    />
  );
}
