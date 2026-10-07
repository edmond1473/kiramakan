import type { Metadata } from "next";
import { pageUser } from "@/lib/server/auth";
import { lastEmptyHookAt, lastNoticeAt, webhookKeyFor } from "@/lib/server/incoming";
import { TngSetup } from "./TngSetup";

export const metadata: Metadata = { title: "iPhone 设定" };

export default async function TngSetupPage() {
  const me = await pageUser();
  const [key, last, empty] = await Promise.all([webhookKeyFor(me.id), lastNoticeAt(me.id), lastEmptyHookAt(me.id)]);
  // 最近一次是空的（比最近收到的通知还新）：第 6 步没设好
  const emptyIsLatest = !!empty && (!last || empty > last);
  return <TngSetup hookKey={key} lastNoticeAt={last} lastEmptyAt={emptyIsLatest ? empty : null} />;
}
