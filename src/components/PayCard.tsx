"use client";

import { useMemo } from "react";
import { withAmount } from "@/lib/emvqr";
import { centsToPlain, formatRM } from "@/lib/money";
import { QrCode } from "./QrCode";
import { CopyButton } from "./ui-client";
import { Notice } from "./ui";

export interface Payee {
  personId: string;
  name: string;
  qrPayload: string | null;
  qrAmountEnabled: boolean;
  payPhone: string | null;
}

/** 朋友付钱用的卡：金额、QR、复制金额 */
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

  return (
    <div className="rounded-xl bg-surface p-4">
      <p className="text-[15px] leading-5 text-label-2">转给 {payee.name}</p>
      <p className="tabular mt-1 text-[34px] leading-[40px] font-bold tracking-[-0.01em]">{formatRM(amountCents)}</p>
      {breakdown && breakdown.owed !== breakdown.preTax && (
        <p className="tabular mt-1 text-[13px] leading-[18px] text-label-2">
          item {formatRM(breakdown.preTax)} + tax / service {formatRM(breakdown.owed - breakdown.preTax)}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2">
        <CopyButton text={centsToPlain(amountCents)} label="复制金额" done={`已复制 ${centsToPlain(amountCents)}`} variant="filled" full />
        {payee.payPhone && (
          <CopyButton text={payee.payPhone.replace(/[^\d+]/g, "")} label={`复制 TNG 电话 ${payee.payPhone}`} variant="gray" full />
        )}
      </div>

      <ol className="mt-4 space-y-1 text-[14px] leading-5 text-label-2">
        <li>1. 打开 TNG → Transfer</li>
        <li>2. 选 {payee.name}{payee.payPhone ? "（或贴上电话）" : ""}，贴上金额</li>
        <li>3. 确认，输入 PIN</li>
      </ol>

      {qr ? (
        <div className="mt-5 flex flex-col items-center border-t border-separator pt-5">
          <QrCode payload={qr.payload} label={`${payee.name} 的收款 QR`} />
          <p className="mt-3 max-w-xs text-center text-[13px] leading-[18px] text-label-2">
            {qr.withAmount
              ? "当面的话直接扫，金额已经填好。"
              : `当面的话直接扫，再输入 ${centsToPlain(amountCents)}。`}
            不在一起：长按存图，再用 TNG 扫描 → 相册。
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <Notice>{payee.name} 还没上传收款 QR，直接 TNG 转给他就可以。</Notice>
        </div>
      )}
    </div>
  );
}
