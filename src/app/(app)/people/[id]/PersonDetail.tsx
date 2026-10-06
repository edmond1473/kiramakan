"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { formatRM } from "@/lib/money";
import { isSettled, type BillPayStatus } from "@/lib/ledger";
import { PaymentSheet } from "@/components/PaymentSheet";
import { Button, Group, Money, PageHeader, Row, StatusChip, formatDate } from "@/components/ui";
import { CopyButton, Field, Sheet, toast, useOrigin } from "@/components/ui-client";

interface ChargeV {
  billId: string;
  title: string;
  billDate: string;
  owed: number;
  preTax: number;
  paid: number;
  remaining: number;
  status: BillPayStatus;
}

interface PaymentV {
  id: string;
  amountCents: number;
  paidAt: string;
  source: string;
  note: string | null;
  incoming: boolean;
}

export function PersonDetail({
  me,
  person,
  toMe,
  fromMe,
  payments,
}: {
  me: { personId: string; name: string };
  person: { id: string; name: string; tngName: string | null; phone: string | null; token: string; isPayer: boolean };
  toMe: { balance: number; charges: ChargeV[] };
  fromMe: { balance: number; charges: ChargeV[] };
  payments: PaymentV[];
}) {
  const router = useRouter();
  const [payOpen, setPayOpen] = useState<"in" | "out" | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const origin = useOrigin();

  const theyOwe = Math.max(0, toMe.balance);
  const iOwe = Math.max(0, fromMe.balance);
  const canOffset = theyOwe > 0 && iOwe > 0 && !isSettled(Math.min(theyOwe, iOwe));
  const personalUrl = `${origin}/p/${person.token}`;
  const waText = `你目前欠 ${me.name} ${formatRM(theyOwe)}。每一餐的明细和付款方式在这里：\n${personalUrl}`;

  async function offset() {
    try {
      const r = await api<{ amount: number }>("/api/payments/offset", { body: { otherPersonId: person.id } });
      toast(`已互抵 ${formatRM(r.amount)}`);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "出错了", "error");
    }
  }

  async function deletePayment(id: string) {
    if (!window.confirm("删除这笔付款记录？")) return;
    try {
      await api(`/api/payments/${id}`, { method: "DELETE" });
      toast("已删除");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "删不到", "error");
    }
  }

  const openTo = toMe.charges.filter((c) => c.status !== "paid");
  const doneTo = toMe.charges.filter((c) => c.status === "paid");

  return (
    <main>
      <PageHeader
        title={person.name}
        back={{ href: "/people", label: "朋友" }}
        subtitle={person.tngName ? `TNG：${person.tngName}` : undefined}
        action={
          <button
            aria-label="修改资料"
            onClick={() => setEditOpen(true)}
            className="flex size-9 items-center justify-center rounded-lg text-tint-text active:bg-fill"
          >
            <Pencil className="size-5" strokeWidth={1.75} />
          </button>
        }
      />
      <div className="px-4">
        <section className="mt-4 rounded-xl bg-surface p-4">
          {theyOwe > 0 && !isSettled(theyOwe) ? (
            <>
              <p className="text-[15px] leading-5 text-label-2">欠你</p>
              <p className="tabular mt-1 text-[34px] leading-[40px] font-bold tracking-[-0.01em]">{formatRM(theyOwe)}</p>
              <p className="mt-1 text-[13px] leading-[18px] text-label-2">
                {openTo.length} 餐还没还清
                {openTo.some((c) => c.status === "forgot_tax") && <span className="text-orange-text"> · 有忘了给 tax</span>}
              </p>
            </>
          ) : toMe.balance < 0 && !isSettled(toMe.balance) ? (
            <p className="text-[15px]">
              多给了你 <Money cents={-toMe.balance} className="font-semibold" />，下次会自动扣。
            </p>
          ) : (
            <p className="text-[17px] leading-6 font-semibold">没有欠你 ✓</p>
          )}
          {iOwe > 0 && !isSettled(iOwe) && (
            <p className="mt-3 border-t border-separator pt-3 text-[14px] leading-5">
              你欠 {person.name} <Money cents={iOwe} className="font-semibold" />
            </p>
          )}
          <div className="mt-4 grid gap-2">
            {theyOwe > 0 && (
              <Button variant="filled" full onClick={() => setPayOpen("in")}>
                记录 {person.name} 付的钱
              </Button>
            )}
            {canOffset && (
              <Button variant="tinted" full onClick={offset}>
                <ArrowLeftRight className="size-4" strokeWidth={2} /> 互抵 {formatRM(Math.min(theyOwe, iOwe))}
              </Button>
            )}
            {iOwe > 0 && (
              <Button full onClick={() => setPayOpen("out")}>
                记录我付给 {person.name}
              </Button>
            )}
          </div>
        </section>

        {theyOwe > 0 && (
          <section className="mt-4 rounded-xl bg-surface p-4">
            <p className="text-[15px] leading-5 font-semibold">发给 {person.name} 看</p>
            <p className="mt-1 text-[13px] leading-[18px] text-label-2">他的专属 link：全部欠款、每一餐的明细，还有你的收款 QR。</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={`https://wa.me/${person.phone ? waNumber(person.phone) : ""}?text=${encodeURIComponent(waText)}`}
                target="_blank"
                rel="noreferrer"
                className="press inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-tint-soft px-4 text-[15px] font-semibold text-tint-text"
              >
                <MessageCircle className="size-[18px]" strokeWidth={2} /> WhatsApp
              </a>
              <CopyButton text={personalUrl} label="复制 link" variant="gray" />
            </div>
          </section>
        )}

        {openTo.length > 0 && (
          <Group title="还没还清的">
            {openTo.map((c) => (
              <ChargeRow key={c.billId} c={c} />
            ))}
          </Group>
        )}
        {fromMe.charges.filter((c) => c.status !== "paid").length > 0 && (
          <Group title={`你欠 ${person.name} 的`}>
            {fromMe.charges
              .filter((c) => c.status !== "paid")
              .map((c) => (
                <ChargeRow key={c.billId} c={c} />
              ))}
          </Group>
        )}

        {payments.length > 0 && (
          <Group title="付款记录">
            {payments.map((p) => (
              <Row
                key={p.id}
                trailing={
                  <div className="flex items-center gap-1">
                    <Money cents={p.amountCents} className="text-[15px] font-semibold" />
                    <button
                      aria-label="删除这笔付款"
                      onClick={() => deletePayment(p.id)}
                      className="flex size-8 items-center justify-center rounded-lg text-label-3 active:bg-fill"
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} />
                    </button>
                  </div>
                }
              >
                <p className="text-[15px] leading-5">{p.incoming ? `${person.name} → 你` : `你 → ${person.name}`}</p>
                <p className="mt-0.5 text-[13px] leading-[18px] text-label-2">
                  {formatDate(p.paidAt.slice(0, 10))}
                  {p.source === "offset" && " · 互抵"}
                  {p.note && p.source !== "offset" && ` · ${p.note}`}
                </p>
              </Row>
            ))}
          </Group>
        )}

        {doneTo.length > 0 && (
          <Group title="已还清的">
            {doneTo.slice(0, 20).map((c) => (
              <ChargeRow key={c.billId} c={c} />
            ))}
          </Group>
        )}
        <div className="h-6" />
      </div>

      <PaymentSheet
        open={payOpen === "in"}
        onClose={() => setPayOpen(null)}
        from={{ id: person.id, name: person.name }}
        to={{ id: me.personId, name: "你" }}
        suggestedCents={theyOwe}
        onSaved={() => router.refresh()}
      />
      <PaymentSheet
        open={payOpen === "out"}
        onClose={() => setPayOpen(null)}
        from={{ id: me.personId, name: "你" }}
        to={{ id: person.id, name: person.name }}
        suggestedCents={iOwe}
        onSaved={() => router.refresh()}
      />
      <EditPersonSheet open={editOpen} onClose={() => setEditOpen(false)} person={person} />
    </main>
  );
}

function ChargeRow({ c }: { c: ChargeV }) {
  return (
    <Row
      href={`/bills/${c.billId}`}
      chevron
      trailing={
        <div className="flex flex-col items-end">
          <Money cents={c.owed} className="text-[15px] font-semibold" />
          <StatusChip status={c.status} remaining={c.remaining} />
        </div>
      }
    >
      <p className="truncate text-[15px] leading-5 font-semibold">{c.title}</p>
      <p className="tabular mt-0.5 text-[13px] leading-[18px] text-label-2">
        {formatDate(c.billDate)} · item {formatRM(c.preTax)}
      </p>
    </Row>
  );
}

function waNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("60")) return d;
  if (d.startsWith("0")) return `6${d}`;
  return d;
}

function EditPersonSheet(props: {
  open: boolean;
  onClose: () => void;
  person: { id: string; name: string; tngName: string | null; phone: string | null };
}) {
  return props.open ? <EditPersonSheetInner {...props} /> : null;
}

function EditPersonSheetInner({
  onClose,
  person,
}: {
  onClose: () => void;
  person: { id: string; name: string; tngName: string | null; phone: string | null };
}) {
  const router = useRouter();
  const [name, setName] = useState(person.name);
  const [tngName, setTngName] = useState(person.tngName ?? "");
  const [phone, setPhone] = useState(person.phone ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open
      onClose={onClose}
      title={`修改 ${person.name}`}
      footer={
        <Button
          variant="filled"
          size="lg"
          full
          loading={busy}
          disabled={!name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/people/${person.id}`, {
                method: "PATCH",
                body: { name, tngName: tngName || null, phone: phone || null },
              });
              toast("已更新");
              onClose();
              router.refresh();
            } catch (e) {
              toast(e instanceof Error ? e.message : "存不到", "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          保存
        </Button>
      }
    >
      <div className="space-y-4 pt-2">
        <Field label="名字" value={name} onChange={(e) => setName(e.target.value)} />
        <Field
          label="TNG 名字"
          value={tngName}
          onChange={(e) => setTngName(e.target.value)}
          placeholder="例如 ALI BIN ABU"
          hint="他转钱给你时 TNG 显示的名字，之后自动对账用。"
        />
        <Field label="电话" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
      </div>
    </Sheet>
  );
}
