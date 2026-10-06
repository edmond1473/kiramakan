import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageUser } from "@/lib/server/auth";
import { billView, loadWorld } from "@/lib/server/world";
import { EditBill } from "./EditBill";

export const metadata: Metadata = { title: "修改账单" };

export default async function EditBillPage(props: PageProps<"/bills/[id]/edit">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await pageUser();
  const w = await loadWorld();
  const view = billView(w, id);
  if (!view) notFound();
  const people = [...w.people.values()]
    .filter((p) => p.isActive)
    .map((p) => ({ id: p.id, name: p.name, isPayer: !!p.userId }));
  return <EditBill view={view} people={people} />;
}
