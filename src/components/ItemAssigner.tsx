"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import type { BillItemView } from "@/lib/server/world";
import { formatRM } from "@/lib/money";
import { Tag, cx } from "./ui";
import { Stepper } from "./ui-client";

/**
 * item 勾选清单：先选「正在分给谁」，再点 item 就加 / 取消。
 * 选了的 item 整行变亮黄；qty > 1 的 item 用 − / + 决定拿几份。
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
    <div className="card list overflow-hidden rounded-[24px] bg-surface">
      {items.map((it) => {
        const mine = activePersonId ? (it.shares.find((s) => s.personId === activePersonId)?.units ?? 0) : 0;
        const countable = Number.isInteger(it.qty) && it.qty > 1;
        const others = it.shares.filter((s) => s.personId !== activePersonId);
        const unclaimedUnits = countable ? Math.max(0, it.qty - it.claimedUnits) : it.claimedUnits === 0 ? 1 : 0;
        const canTap = !!activePersonId && !disabled && busyItemId !== it.id;
        const toggle = () => canTap && onSetUnits(it.id, mine > 0 ? 0 : 1);
        const on = mine > 0;
        return (
          <div key={it.id} className={cx("row flex items-stretch pl-4 transition-colors", on && "on-color on-volt bg-volt")}>
            {activePersonId && (
              <button
                type="button"
                onClick={toggle}
                disabled={!canTap}
                aria-pressed={on}
                aria-label={`${it.name}：${on ? "取消" : "加给"}${activeName ?? ""}`}
                className="flex shrink-0 items-center py-3 pr-3.5 disabled:cursor-default"
              >
                <span
                  className={cx(
                    "flex size-[26px] items-center justify-center rounded-[6px] border-2 transition-colors",
                    on ? "border-ink bg-ink text-volt" : "border-label",
                    disabled && "opacity-40",
                  )}
                >
                  {on && <Check className="size-4" strokeWidth={3.5} />}
                </span>
              </button>
            )}
            <div
              className={cx(
                "row-sep flex min-h-[68px] min-w-0 flex-1 items-center gap-2 border-b py-3 pr-3",
                on ? "border-ink/10" : "border-separator",
              )}
            >
              <button type="button" onClick={toggle} disabled={!canTap} className="min-w-0 flex-1 text-left disabled:cursor-default">
                <span className="block text-[16px] leading-[21px] font-semibold">{it.name}</span>
                <span
                  className={cx(
                    "tabular mt-1 block font-mono text-[12px] leading-4 tracking-[0.03em] uppercase",
                    on ? "text-ink/70" : "text-label-2",
                  )}
                >
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
                  <Tag tone="flare" className="mt-2">
                    {countable && it.claimedUnits > 0 ? `还有 ${unclaimedUnits} 份没人认领` : "还没人认领"}
                  </Tag>
                )}
                {it.overClaimed && (
                  <span className={cx("mt-1 block text-[12px] leading-4", on ? "text-ink/70" : "text-label-2")}>
                    认领的份数比数量多，会按人头平分
                  </span>
                )}
              </button>
              {countable && activePersonId && !disabled && on && (
                <Stepper
                  value={mine}
                  min={0}
                  max={Math.max(it.qty, mine) + 2}
                  label={`${it.name} 份数`}
                  tone="ink"
                  onChange={(v) => busyItemId !== it.id && onSetUnits(it.id, v)}
                />
              )}
              {onOpenItem && (
                <button
                  type="button"
                  aria-label={`${it.name}：设定谁吃了`}
                  onClick={() => onOpenItem(it)}
                  className={cx(
                    "flex size-10 shrink-0 items-center justify-center rounded-full active:bg-fill",
                    on ? "text-ink/70" : "text-label-2",
                  )}
                >
                  <SlidersHorizontal className="size-[18px]" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
