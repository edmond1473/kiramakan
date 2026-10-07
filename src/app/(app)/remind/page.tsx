import type { Metadata } from "next";
import { pageUser } from "@/lib/server/auth";
import { loadWorld } from "@/lib/server/world";
import { pendingCount } from "@/lib/server/incoming";
import { reminderData } from "@/lib/server/remind";
import { RemindList } from "./RemindList";

export const metadata: Metadata = { title: "谁还没还" };

export default async function RemindPage() {
  const me = await pageUser();
  const [w, pending] = await Promise.all([loadWorld(), pendingCount(me.id)]);
  const data = reminderData(w, me.personId, pending);
  const contacts = Object.fromEntries(
    data.debtors.map((d) => {
      const p = w.people.get(d.personId);
      return [d.personId, { token: p?.token ?? "", phone: p?.phone ?? null }];
    }),
  );
  const shareTokens = Object.fromEntries(data.unclaimed.map((u) => [u.billId, w.billById.get(u.billId)?.shareToken ?? ""]));
  return <RemindList data={data} myName={me.name} contacts={contacts} shareTokens={shareTokens} />;
}
