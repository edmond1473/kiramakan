import type { Metadata } from "next";
import { pageUser } from "@/lib/server/auth";
import { webhookKeyFor } from "@/lib/server/incoming";
import { statementInfo } from "@/lib/server/statement";
import { TngStatement } from "./TngStatement";

export const metadata: Metadata = { title: "TNG 交易记录对账" };

export default async function TngStatementPage() {
  const me = await pageUser();
  const [key, info] = await Promise.all([webhookKeyFor(me.id), statementInfo(me.id)]);
  return <TngStatement hookKey={key} passwordSet={!!process.env.TNG_PDF_PASSWORD} {...info} />;
}
