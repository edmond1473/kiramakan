"use client";

import { Check, CircleAlert, Info, Plus, TriangleAlert } from "lucide-react";
import type { CrossCheck, ReadItem } from "@/lib/receipt-compare";
import { formatRM } from "@/lib/money";
import { cx } from "./ui";

/** 核对画面顶部：两个 AI 读的结果比对（整块颜色 = 结果） */
export function CrossCheckBanner({
  check,
  extraItems,
  onAddExtra,
}: {
  check: CrossCheck;
  extraItems: (ReadItem & { from: string })[];
  onAddExtra: (item: ReadItem & { from: string }) => void;
}) {
  const tone = {
    match: { bg: "bg-forest text-white", Icon: Check },
    picked: { bg: "bg-volt text-ink", Icon: TriangleAlert },
    unsure: { bg: "bg-flare text-ink", Icon: CircleAlert },
    single: { bg: "bg-indigo text-white", Icon: Info },
  }[check.status];
  const { Icon } = tone;

  return (
    <section className={cx("on-color mt-6 rounded-[24px] p-5", tone.bg)} aria-label="两个 AI 的比对结果">
      <div className="flex gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-current/15">
          <Icon className="size-5" strokeWidth={2.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="pt-1.5 text-[16px] leading-[22px] font-semibold">{check.message}</p>
          <ul className="mt-3 space-y-1.5 font-mono text-[12px] leading-[17px] tracking-[0.02em]">
            {check.providers.map((p) => (
              <li key={p.provider} className="tabular opacity-90">
                <span className="font-medium uppercase">{p.label}</span>
                {p.ok ? (
                  <>
                    ：{p.itemCount} 个 item，总额 {formatRM(p.totalCents ?? 0)}
                    {p.balanced ? " · 加起来对得上 ✓" : " · 加起来对不上"}
                    {p.provider === check.chosen && check.status !== "match" && " · 用这个"}
                  </>
                ) : (
                  <>：没读到（{p.error ?? "失败"}）</>
                )}
              </li>
            ))}
          </ul>
          {check.totals && (
            <p className="tabular mt-3 text-[13px] leading-[18px] font-semibold">
              总额读得不一样：{check.totals.map((t) => `${t.label} ${formatRM(t.totalCents)}`).join("、")}。请看 receipt 上最后付的数目。
            </p>
          )}
        </div>
      </div>

      {extraItems.length > 0 && (
        <div className="mt-4 border-t border-current/20 pt-4">
          <p className="text-[13px] leading-[18px] opacity-90">
            {extraItems[0].from} 还读到这些，{check.chosenLabel} 没有。是 receipt 上有的就加进来：
          </p>
          <ul className="mt-3 space-y-2">
            {extraItems.map((e, i) => (
              <li key={`${e.name}-${i}`} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-[15px] leading-5 font-medium">
                  {e.name}
                  {e.qty !== 1 && ` ×${e.qty}`} <span className="tabular opacity-75">{formatRM(e.lineCents)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onAddExtra(e)}
                  className="press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 font-mono text-[12px] font-medium tracking-[0.05em] text-ink uppercase"
                >
                  <Plus className="size-3.5" strokeWidth={2.75} /> 加进来
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
