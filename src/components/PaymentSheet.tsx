"use client";

import { useEffect, useState, useTransition } from "react";
import { api } from "@/lib/client/api";
import { centsToPlain, formatRM, parseRM } from "@/lib/money";
import type { PaymentVerdict } from "@/lib/ledger";
import { Button, Notice, formatWhen, todayMY } from "./ui";
import { Field, Sheet, toast } from "./ui-client";

interface Props {
  open: boolean;
  onClose: () => void;
  from: { id: string; name: string };
  to: { id: string; name: string };
  suggestedCents: number;
  onSaved: () => void;
}

/** 记录一笔收款；输入金额时马上判断是不是忘了 tax、多给、还欠多少 */
export function PaymentSheet(props: Props) {
  // 每次打开都重新 mount，表格自动回到预设值
  return props.open ? <PaymentSheetInner {...props} /> : null;
}

function PaymentSheetInner({ onClose, from, to, suggestedCents, onSaved }: Props) {
  const [amount, setAmount] = useState(suggestedCents > 0 ? centsToPlain(suggestedCents) : "");
  const [date, setDate] = useState(todayMY());
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<{ cents: number; verdict: PaymentVerdict; alreadyAuto: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const cents = parseRM(amount);
  useEffect(() => {
    if (!cents || cents <= 0) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await api<{ verdict: PaymentVerdict; alreadyAuto: string | null }>("/api/payments/preview", {
          body: { fromPersonId: from.id, toPersonId: to.id, amountCents: cents },
        });
        if (alive) setPreview({ cents, verdict: r.verdict, alreadyAuto: r.alreadyAuto });
      } catch {
        // 预览失败不影响记录
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [cents, from.id, to.id]);
  const verdict = preview && preview.cents === cents ? preview.verdict : null;
  const alreadyAuto = preview && preview.cents === cents ? preview.alreadyAuto : null;

  async function save() {
    if (!cents || cents <= 0) return;
    setSaving(true);
    try {
      const paidAt = date === todayMY() ? null : `${date}T12:00:00+08:00`;
      await api("/api/payments", {
        body: { fromPersonId: from.id, toPersonId: to.id, amountCents: cents, paidAt, note: note || null },
      });
      toast(`已记录 ${pairLabel(from.name, to.name)} ${formatRM(cents)}`);
      // 新的数字拿到了才一起关掉：关的那一刻画面已经更新，不会先看到旧数字再跳
      startTransition(() => {
        onSaved();
        onClose();
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "存不到", "error");
      setSaving(false);
    }
  }

  const tone =
    verdict?.kind === "forgot_tax" ? "warn" : verdict?.kind === "settles_all" || verdict?.kind === "overpay" ? "ok" : "info";

  return (
    <Sheet
      open
      onClose={onClose}
      title={pairLabel(from.name, to.name)}
      footer={
        <Button variant="filled" size="lg" full loading={saving} disabled={!cents || cents <= 0} onClick={save}>
          记录收款
        </Button>
      }
    >
      <div className="space-y-5">
        <Field
          label="收到多少（RM）"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoFocus
          className="[&_input]:tabular [&_input]:h-14 [&_input]:text-[24px] [&_input]:font-semibold"
          hint={suggestedCents > 0 ? `目前欠 ${formatRM(suggestedCents)}` : undefined}
        />
        {alreadyAuto && (
          <Notice tone="warn">
            TNG 通知已经自动记了一笔一样的 {formatRM(cents ?? 0)}（{formatWhen(alreadyAuto)}）。是同一笔的话不用再记。
          </Notice>
        )}
        {verdict && <Notice tone={tone}>{verdict.message}</Notice>}
        <Field label="日期" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Field label="备注（可以不填）" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如 TNG 转账" />
      </div>
    </Sheet>
  );
}

function pairLabel(from: string, to: string): string {
  if (to === "你") return `${from} 给你`;
  if (from === "你") return `你给 ${to}`;
  return `${from} 给 ${to}`;
}
