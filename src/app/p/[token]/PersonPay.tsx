"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { formatRM } from "@/lib/money";
import { PayCard, type Payee } from "@/components/PayCard";
import { Button } from "@/components/ui";
import { toast } from "@/components/ui-client";

/** 「我的账」页每个人的付款卡：还欠 → 付款卡（按「打开 TNG」先算付了）；按过了 → 等核对，可以取消 */
export function PersonPay({
  token,
  payee,
  balance,
  unverified,
}: {
  token: string;
  payee: Payee & { hasAccount: boolean };
  balance: number;
  unverified: number;
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);

  // 从 TNG 回来：拿最新的状况
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [router]);

  async function cancel() {
    setCancelling(true);
    try {
      await api(`/api/p/${token}/pay`, { method: "DELETE", body: { creditorId: payee.personId } });
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "取消不到，再试一次", "error");
    } finally {
      setCancelling(false);
    }
  }

  if (balance <= 0 && unverified > 0) {
    return (
      <div className="card rounded-[24px] bg-surface p-5">
        <p className="label-mono text-label-2">转给 {payee.name}</p>
        <p className="display mt-3 text-[34px] leading-none">已付 ✓</p>
        <p className="mt-3 text-[14px] leading-[21px] text-label-2">
          你按了「打开 TNG」，先算你付了 {formatRM(unverified)}。{payee.name} 每晚会用 TNG 交易记录核对一次，没有这笔的话会改回未付。
        </p>
        <Button full className="mt-4" loading={cancelling} onClick={cancel}>
          其实还没付
        </Button>
      </div>
    );
  }

  return (
    <PayCard
      payee={payee}
      amountCents={balance}
      onOpenTng={
        payee.hasAccount
          ? () => {
              // 不等结果：跳去 TNG 之前送出去就好（记不到也没关系，晚上 TNG 交易记录有这笔一样会记好）
              api(`/api/p/${token}/pay`, { body: { creditorId: payee.personId }, keepalive: true })
                .then(() => router.refresh())
                .catch(() => {});
            }
          : undefined
      }
    />
  );
}
