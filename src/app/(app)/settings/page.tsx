import type { Metadata } from "next";
import { pageUser } from "@/lib/server/auth";
import { loadWorld } from "@/lib/server/world";
import { lastNoticeAt, pendingCount } from "@/lib/server/incoming";
import { deviceCount } from "@/lib/server/push";
import { notifySettings } from "@/lib/server/remind";
import { Settings } from "./Settings";

export const metadata: Metadata = { title: "设定" };

export default async function SettingsPage() {
  const me = await pageUser();
  const [w, lastNotice, pending, devices, notify] = await Promise.all([
    loadWorld(),
    lastNoticeAt(me.id),
    pendingCount(me.id),
    deviceCount(me.id),
    notifySettings(me.id),
  ]);
  const people = [...w.people.values()]
    .filter((p) => p.isActive && !p.userId)
    .map((p) => ({ id: p.id, name: p.name }));
  const payers = [...w.people.values()].filter((p) => p.userId).map((p) => ({ id: p.id, name: p.name }));
  return (
    <Settings
      me={{
        name: me.name,
        username: me.username,
        tngName: me.tngName,
        qrPayload: me.qrPayload,
        qrAmountEnabled: me.qrAmountEnabled,
        payPhone: me.payPhone,
        isAdmin: me.isAdmin,
      }}
      friendsWithoutAccount={people}
      payers={payers}
      tng={{ lastNoticeAt: lastNotice, pending }}
      push={{ devices, remindEvery: notify.remindEvery, notifyPayments: notify.notifyPayments }}
    />
  );
}
