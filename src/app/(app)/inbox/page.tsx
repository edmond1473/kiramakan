import type { Metadata } from "next";
import { pageUser } from "@/lib/server/auth";
import { ledgerBetween, loadWorld } from "@/lib/server/world";
import { listIncoming } from "@/lib/server/incoming";
import { classifyPayment, DEFAULT_TOLERANCE_CENTS } from "@/lib/ledger";
import { matchSender } from "@/lib/tng-notify";
import { Inbox, type OtherV, type PendingV, type PersonOpt, type RecordedV } from "./Inbox";

export const metadata: Metadata = { title: "TNG 进账" };

export default async function InboxPage() {
  const me = await pageUser();
  const [w, rows] = await Promise.all([loadWorld(), listIncoming(me.id)]);

  const owedOf = new Map<string, number>();
  const people: PersonOpt[] = [];
  for (const p of w.people.values()) {
    if (p.id === me.personId) continue;
    const owed = Math.max(0, ledgerBetween(w, p.id, me.personId).balance);
    if (!p.isActive && owed <= DEFAULT_TOLERANCE_CENTS) continue;
    owedOf.set(p.id, owed);
    people.push({ id: p.id, name: p.name, owed });
  }
  people.sort((a, b) => (b.owed > 0 ? 1 : 0) - (a.owed > 0 ? 1 : 0) || a.name.localeCompare(b.name));

  const pending: PendingV[] = [];
  const recorded: RecordedV[] = [];
  const others: OtherV[] = [];

  for (const r of rows) {
    if (r.status === "pending") {
      const amount = r.amountCents ?? 0;
      // 推荐：欠的金额刚好对上的、像是忘了 tax 的、名字有一点像的，再来是其他还欠你的人
      const nameHits = new Set(
        r.senderName
          ? matchSender(
              r.senderName,
              people.map((p) => ({ personId: p.id, tngNames: [w.people.get(p.id)?.tngName ?? ""], displayName: p.name, owes: p.owed > 0 })),
            ).tied
          : [],
      );
      const ranked = people
        .filter((p) => p.owed > DEFAULT_TOLERANCE_CENTS || nameHits.has(p.id) || p.id === r.fromPersonId)
        .map((p) => {
          const v = amount > 0 ? classifyPayment(amount, ledgerBetween(w, p.id, me.personId)) : null;
          const hint =
            v?.kind === "settles_all"
              ? "金额刚好"
              : v?.kind === "forgot_tax"
                ? "像是忘了 tax"
                : v?.kind === "settles_some"
                  ? `刚好还清 ${v.bills} 餐`
                  : p.id === r.fromPersonId
                    ? "之前记给他"
                    : nameHits.has(p.id)
                      ? "名字像"
                      : null;
          const rank =
            v?.kind === "settles_all" ? 0 : v?.kind === "forgot_tax" ? 1 : v?.kind === "settles_some" ? 2 : hint ? 3 : 4;
          return { id: p.id, name: p.name, owed: p.owed, hint, rank };
        })
        .sort((a, b) => a.rank - b.rank || b.owed - a.owed)
        .slice(0, 4)
        .map((x) => ({ id: x.id, name: x.name, owed: x.owed, hint: x.hint }));
      const person = r.fromPersonId ? { id: r.fromPersonId, name: r.personName ?? "?", owed: owedOf.get(r.fromPersonId) ?? 0 } : null;
      pending.push({
        id: r.id,
        amountCents: r.amountCents,
        senderName: r.senderName,
        rawText: r.rawText,
        receivedAt: r.receivedAt,
        reason: r.reason,
        person: r.reason === "overpay" || r.reason === "no_debt" || r.reason === "unsure" ? person : null,
        suggestions: ranked,
      });
    } else if (r.status === "recorded") {
      recorded.push({
        id: r.id,
        amountCents: r.amountCents ?? 0,
        personId: r.fromPersonId,
        personName: r.personName ?? "?",
        verdict: r.verdict,
        verdictKind: r.verdictKind,
        receivedAt: r.receivedAt,
        auto: !r.reason,
      });
    } else {
      others.push({
        id: r.id,
        amountCents: r.amountCents,
        rawText: r.rawText,
        receivedAt: r.receivedAt,
        status: r.status,
        direction: r.direction,
      });
    }
  }

  return <Inbox pending={pending} recorded={recorded} others={others} people={people} />;
}
