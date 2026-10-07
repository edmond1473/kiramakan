import type { Metadata, Viewport } from "next";
import { unstable_rethrow } from "next/navigation";
import { isSettled, type ChargeState } from "@/lib/ledger";
import { formatRM } from "@/lib/money";
import { allPairs, ledgerBetween, loadWorld, payeeInfo, type PayeeInfo } from "@/lib/server/world";
import { BigMoney, Empty, Group, Hero, Money, Row, StatusChip, formatDate } from "@/components/ui";
import { SetupProblem } from "@/components/SetupProblem";
import { PayCard } from "@/components/PayCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "我的账", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#fff100" };

interface Section {
  payee: PayeeInfo;
  balance: number;
  open: (ChargeState & { title: string; shareToken: string | null })[];
}

async function load(token: string): Promise<{ name: string; sections: Section[] } | null> {
  const w = await loadWorld();
  const person = [...w.people.values()].find((p) => p.token === token);
  if (!person) return null;
  const creditors = [...new Set(allPairs(w).filter(([d]) => d === person.id).map(([, c]) => c))];
  const sections = creditors
    .map((c) => ({ c, ledger: ledgerBetween(w, person.id, c) }))
    .filter((s) => s.ledger.balance > 0 && !isSettled(s.ledger.balance))
    .map<Section>(({ c, ledger }) => ({
      payee: payeeInfo(w, c),
      balance: ledger.balance,
      open: ledger.charges
        .filter((x) => x.status !== "paid")
        .map((x) => {
          const b = w.billById.get(x.billId);
          return { ...x, title: b?.title ?? "?", shareToken: b?.shareToken ?? null };
        }),
    }));
  return { name: person.name, sections };
}

export default async function PersonalPage(props: PageProps<"/p/[token]">) {
  const { token } = await props.params;
  let data: Awaited<ReturnType<typeof load>> = null;
  let error: unknown = null;
  try {
    data = await load(token);
  } catch (e) {
    unstable_rethrow(e);
    error = e;
  }
  if (error) return <SetupProblem error={error} />;
  if (!data) {
    return (
      <main className="mx-auto max-w-lg px-4 pt-16">
        <Empty title="找不到这个 link">请叫发给你的人再发一次。</Empty>
      </main>
    );
  }
  const total = data.sections.reduce((sum, s) => sum + s.balance, 0);
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-12">
      <Hero className="pt-[max(10px,env(safe-area-inset-top))]">
        <div className="flex h-12 items-center">
          <span className="display text-[20px] tracking-[-0.035em]">KiraMakan</span>
        </div>
        <h1 className="display mt-8 text-[46px] leading-[0.95] break-words">{data.name} 的账</h1>
        {total > 0 && (
          <>
            <p className="label-mono mt-6">总共还欠</p>
            <BigMoney cents={total} className="mt-2 text-[52px] leading-[0.9]" />
          </>
        )}
      </Hero>
      <div className="px-4">
      {data.sections.length === 0 ? (
        <Empty title="全部还清了 ✓">目前没有欠任何人。</Empty>
      ) : (
        data.sections.map((s) => (
          <section key={s.payee.personId} className="mt-8">
            <h2 className="label-mono px-1 text-label-2">
              欠 {s.payee.name} · <span className="tabular">{formatRM(s.balance)}</span>
            </h2>
            <Group className="mt-2.5">
              {s.open.map((c) => (
                <Row
                  key={c.billId}
                  href={c.shareToken ? `/b/${c.shareToken}` : undefined}
                  chevron={!!c.shareToken}
                  trailing={<Money cents={c.owed} className="text-[16px] font-semibold" />}
                >
                  <p className="truncate text-[16px] leading-[21px] font-semibold">{c.title}</p>
                  <p className="mt-0.5 text-[13px] leading-[18px] text-label-2">{formatDate(c.billDate)}</p>
                  <div className="mt-1.5">
                    <StatusChip status={c.status} remaining={c.remaining} />
                  </div>
                </Row>
              ))}
            </Group>
            <div className="mt-3">
              <PayCard payee={s.payee} amountCents={s.balance} />
            </div>
          </section>
        ))
      )}
      </div>
    </div>
  );
}
