"use client";

import { useMemo } from "react";
import { withAmount } from "@/lib/emvqr";
import { centsToPlain, formatRM } from "@/lib/money";
import { QrCode } from "./QrCode";
import { CopyButton } from "./ui-client";
import { BigMoney, Notice } from "./ui";

export interface Payee {
  personId: string;
  name: string;
  qrPayload: string | null;
  qrAmountEnabled: boolean;
  payPhone: string | null;
}

/** 朋友付钱用的卡：金额、复制金额、步骤、QR */
export function PayCard({
  payee,
  amountCents,
  breakdown,
}: {
  payee: Payee;
  amountCents: number;
  breakdown?: { preTax: number; owed: number } | null;
}) {
  const qr = useMemo(() => {
    if (!payee.qrPayload) return null;
    if (payee.qrAmountEnabled) {
      const dyn = withAmount(payee.qrPayload, amountCents);
      if (dyn) return { payload: dyn, withAmount: true };
    }
    return { payload: payee.qrPayload, withAmount: false };
  }, [payee.qrPayload, payee.qrAmountEnabled, amountCents]);

  const steps = [
    "打开 TNG → Transfer",
    `选 ${payee.name}${payee.payPhone ? "（或贴上电话）" : ""}，贴上金额`,
    "确认，输入 PIN",
  ];

  return (
    <div className="card rounded-[24px] bg-surface p-5">
      <p className="label-mono text-label-2">转给 {payee.name}</p>
      <BigMoney cents={amountCents} className="mt-3 text-[52px] leading-[0.9]" />
      {breakdown && breakdown.owed !== breakdown.preTax && (
        <p className="tabular mt-3 font-mono text-[12px] leading-4 tracking-[0.03em] text-label-2 uppercase">
          item {formatRM(breakdown.preTax)} + tax / service {formatRM(breakdown.owed - breakdown.preTax)}
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-2">
        <CopyButton
          text={centsToPlain(amountCents)}
          label="复制金额"
          done={`已复制 ${centsToPlain(amountCents)}`}
          variant="filled"
          size="lg"
          full
        />
        {payee.payPhone && (
          <CopyButton text={payee.payPhone.replace(/[^\d+]/g, "")} label={`复制 TNG 电话 ${payee.payPhone}`} variant="gray" full />
        )}
      </div>

      <ol className="mt-6 space-y-3">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-3 text-[15px] leading-5">
            <span className="display flex size-7 shrink-0 items-center justify-center rounded-full bg-contrast text-[14px] tracking-normal text-on-contrast">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>

      {qr ? (
        <div className="mt-6 flex flex-col items-center border-t border-separator pt-6">
          <QrCode payload={qr.payload} label={`${payee.name} 的收款 QR`} />
          <p className="mt-4 max-w-xs text-center text-[13px] leading-[19px] text-label-2">
            {qr.withAmount
              ? "当面的话直接扫，金额已经填好。"
              : `当面的话直接扫，再输入 ${centsToPlain(amountCents)}。`}
            不在一起：长按存图，再用 TNG 扫描 → 相册。
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <Notice>{payee.name} 还没上传收款 QR，直接 TNG 转给他就可以。</Notice>
        </div>
      )}
    </div>
  );
}
