"use client";

import { Check, CircleAlert, Info, Plus, TriangleAlert } from "lucide-react";
import type { CrossCheck, ReadItem } from "@/lib/receipt-compare";
import { formatRM } from "@/lib/money";
import { cx } from "./ui";

/** 核对画面顶部：两个 AI 读的结果比对 */
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
    match: { bg: "bg-[color-mix(in_srgb,var(--green)_14%,transparent)]", Icon: Check, icon: "text-green-text" },
    picked: { bg: "bg-[color-mix(in_srgb,var(--orange)_14%,transparent)]", Icon: TriangleAlert, icon: "text-orange-text" },
    unsure: { bg: "bg-[color-mix(in_srgb,var(--red)_12%,transparent)]", Icon: CircleAlert, icon: "text-red-text" },
    single: { bg: "bg-tint-soft", Icon: Info, icon: "text-tint-text" },
  }[check.status];
  const { Icon } = tone;

  return (
    <section className={cx("mt-4 rounded-xl px-4 py-3", tone.bg)} aria-label="两个 AI 的比对结果">
      <div className="flex gap-2.5">
        <Icon className={cx("mt-0.5 size-5 shrink-0", tone.icon)} strokeWidth={2} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-5 font-medium">{check.message}</p>
          <ul className="mt-1.5 space-y-0.5 text-[13px] leading-[18px] text-label-2">
            {check.providers.map((p) => (
              <li key={p.provider} className="tabular">
                <span className="font-medium text-label">{p.label}</span>
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
            <p className="tabular mt-2 text-[13px] leading-[18px] font-medium text-red-text">
              总额读得不一样：{check.totals.map((t) => `${t.label} ${formatRM(t.totalCents)}`).join("、")}。请看 receipt 上最后付的数目。
            </p>
          )}
        </div>
      </div>

      {extraItems.length > 0 && (
        <div className="mt-3 border-t border-separator pt-3">
          <p className="text-[13px] leading-[18px] text-label-2">
            {extraItems[0].from} 还读到这些，{check.chosenLabel} 没有。是 receipt 上有的就加进来：
          </p>
          <ul className="mt-2 space-y-2">
            {extraItems.map((e, i) => (
              <li key={`${e.name}-${i}`} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-[14px] leading-5">
                  {e.name}
                  {e.qty !== 1 && ` ×${e.qty}`} <span className="tabular text-label-2">{formatRM(e.lineCents)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onAddExtra(e)}
                  className="press inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-surface px-3 text-[13px] font-semibold text-tint-text"
                >
                  <Plus className="size-3.5" strokeWidth={2.5} /> 加进来
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
