import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageUser } from "@/lib/server/auth";
import { ledgerBetween, loadWorld } from "@/lib/server/world";
import { PersonDetail } from "./PersonDetail";

export const metadata: Metadata = { title: "朋友" };

export default async function PersonPage(props: PageProps<"/people/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const me = await pageUser();
  const w = await loadWorld();
  const person = w.people.get(id);
  if (!person) notFound();
  const title = (billId: string) => w.billById.get(billId)?.title ?? "?";
  const toMe = ledgerBetween(w, id, me.personId);
  const fromMe = ledgerBetween(w, me.personId, id);
  const payments = w.payments
    .filter(
      (p) =>
        (p.fromPersonId === id && p.toPersonId === me.personId) || (p.fromPersonId === me.personId && p.toPersonId === id),
    )
    .reverse()
    .map((p) => ({ ...p, incoming: p.toPersonId === me.personId }));
  const mapCharges = (l: typeof toMe) =>
    l.charges.map((c) => ({
      billId: c.billId,
      title: title(c.billId),
      billDate: c.billDate,
      owed: c.owed,
      preTax: c.preTax,
      paid: c.paid,
      remaining: c.remaining,
      status: c.status,
    }));

  return (
    <PersonDetail
      me={{ personId: me.personId, name: me.name }}
      person={{
        id: person.id,
        name: person.name,
        tngName: person.tngName,
        phone: person.phone,
        token: person.token,
        isPayer: !!person.userId,
      }}
      toMe={{ balance: toMe.balance, charges: mapCharges(toMe) }}
      fromMe={{ balance: fromMe.balance, charges: mapCharges(fromMe) }}
      payments={payments}
    />
  );
}
