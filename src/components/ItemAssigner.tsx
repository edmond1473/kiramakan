"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import type { BillItemView } from "@/lib/server/world";
import { formatRM } from "@/lib/money";
import { cx } from "./ui";
import { Stepper } from "./ui-client";

/**
 * item 列表：先选「正在分给谁」，再点 item 就加 / 取消。
 * qty > 1 的 item 用 +/- 决定拿几份。
 */
export function ItemAssigner({
  items,
  activePersonId,
  activeName,
  disabled,
  busyItemId,
  onSetUnits,
  onOpenItem,
}: {
  items: BillItemView[];
  activePersonId: string | null;
  activeName?: string;
  disabled?: boolean;
  busyItemId?: string | null;
  onSetUnits: (itemId: string, units: number) => void;
  onOpenItem?: (item: BillItemView) => void;
}) {
  return (
    <div className="list overflow-hidden rounded-xl bg-surface">
      {items.map((it) => {
        const mine = activePersonId ? (it.shares.find((s) => s.personId === activePersonId)?.units ?? 0) : 0;
        const countable = Number.isInteger(it.qty) && it.qty > 1;
        const others = it.shares.filter((s) => s.personId !== activePersonId);
        const unclaimedUnits = countable ? Math.max(0, it.qty - it.claimedUnits) : it.claimedUnits === 0 ? 1 : 0;
        const canTap = !!activePersonId && !disabled && busyItemId !== it.id;
        const toggle = () => canTap && onSetUnits(it.id, mine > 0 ? 0 : 1);
        return (
          <div key={it.id} className={cx("row flex items-stretch pl-4", mine > 0 && "bg-tint-soft")}>
            {activePersonId && (
              <button
                type="button"
                onClick={toggle}
                disabled={!canTap}
                aria-pressed={mine > 0}
                aria-label={`${it.name}：${mine > 0 ? "取消" : "加给"}${activeName ?? ""}`}
                className="flex shrink-0 items-center py-3 pr-3 disabled:cursor-default"
              >
                <span
                  className={cx(
                    "flex size-6 items-center justify-center rounded-full border-2 transition-colors",
                    mine > 0 ? "border-tint bg-tint text-white" : "border-label-3",
                    disabled && "opacity-50",
                  )}
                >
                  {mine > 0 && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
            )}
            <div className="row-sep flex min-h-[60px] min-w-0 flex-1 items-center gap-2 border-b border-separator py-2.5 pr-3">
              <button type="button" onClick={toggle} disabled={!canTap} className="min-w-0 flex-1 text-left disabled:cursor-default">
                <span className="block text-[15px] leading-5 font-semibold">{it.name}</span>
                <span className="tabular mt-0.5 block text-[13px] leading-[18px] text-label-2">
                  {it.qty !== 1 && <>×{Number.isInteger(it.qty) ? it.qty : it.qty.toFixed(2)} · </>}
                  {formatRM(it.lineCents)}
                  {others.length > 0 && (
                    <>
                      {" · "}
                      {others.map((s) => (s.units > 1 ? `${s.name}×${s.units}` : s.name)).join("、")}
                    </>
                  )}
                </span>
                {unclaimedUnits > 0 && (
                  <span className="mt-0.5 block text-[12px] leading-4 font-medium text-orange-text">
                    {countable && it.claimedUnits > 0 ? `还有 ${unclaimedUnits} 份没人认领` : "还没人认领"}
                  </span>
                )}
                {it.overClaimed && (
                  <span className="mt-0.5 block text-[12px] leading-4 text-label-2">认领的份数比数量多，会按人头平分</span>
                )}
              </button>
              {countable && activePersonId && !disabled && mine > 0 && (
                <Stepper
                  value={mine}
                  min={0}
                  max={Math.max(it.qty, mine) + 2}
                  label={`${it.name} 份数`}
                  onChange={(v) => busyItemId !== it.id && onSetUnits(it.id, v)}
                />
              )}
              {onOpenItem && (
                <button
                  type="button"
                  aria-label={`${it.name}：设定谁吃了`}
                  onClick={() => onOpenItem(it)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-label-2 active:bg-fill"
                >
                  <SlidersHorizontal className="size-[18px]" strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
