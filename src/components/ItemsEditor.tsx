"use client";

import { AlertTriangle, Check, Plus, Trash2 } from "lucide-react";
import { centsToPlain, formatRM } from "@/lib/money";
import { newKey, parseDraft, type Draft, type DraftCharge, type DraftItem } from "@/lib/receipt";
import { Button, Group, Notice, cx } from "./ui";
import { Field } from "./ui-client";

const inputCls =
  "h-10 min-w-0 rounded-lg border border-separator bg-surface px-3 text-[16px] text-label outline-none placeholder:text-label-3 focus:border-tint";

/** 核对 / 修改 receipt：名字、日期、item、charges、总额 */
export function ItemsEditor({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const parsed = parseDraft(draft);
  const factor = parsed.itemsSum > 0 && parsed.totalCents > 0 ? parsed.totalCents / parsed.itemsSum : null;

  // 改过这一行，两个 AI 的差异提示就清掉
  const setItem = (key: string, patch: Partial<DraftItem>) =>
    onChange({ ...draft, items: draft.items.map((i) => (i.key === key ? { ...i, ...patch, note: null } : i)) });
  const missing = parsed.totalCents - parsed.itemsSum - parsed.chargesSum; // 要补多少才对得上总额
  const showBalance = parsed.totalCents > 0 && parsed.items.length > 0;
  const addBalancingLine = () =>
    onChange({
      ...draft,
      charges: [
        ...draft.charges,
        { key: newKey(), label: Math.abs(missing) <= 10 ? "Rounding" : "其他（差额）", amount: centsToPlain(missing) },
      ],
    });
  const setCharge = (key: string, patch: Partial<DraftCharge>) =>
    onChange({ ...draft, charges: draft.charges.map((c) => (c.key === key ? { ...c, ...patch } : c)) });

  return (
    <div>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
        <Field
          label="餐厅"
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          placeholder="例如 Restoran Sri Melayu"
        />
        <Field
          label="日期"
          type="date"
          value={draft.date}
          onChange={(e) => onChange({ ...draft, date: e.target.value })}
          className="w-[150px]"
        />
      </div>

      <Group title={`Item（${draft.items.length}）`}>
        {draft.items.map((it, idx) => (
          <div key={it.key} className={cx("row px-4", it.note && "bg-[color-mix(in_srgb,var(--orange)_10%,transparent)]")}>
            <div className="row-sep border-b border-separator py-3">
              {it.note && (
                <p className="mb-2 flex items-center gap-1.5 text-[13px] leading-[18px] font-medium text-orange-text">
                  <AlertTriangle className="size-4 shrink-0" strokeWidth={2} aria-hidden /> {it.note}，请对一下 receipt
                </p>
              )}
              <div className="flex items-center gap-2">
                <input
                  aria-label={`第 ${idx + 1} 个 item 名字`}
                  className={cx(inputCls, "w-full flex-1 font-semibold")}
                  value={it.name}
                  placeholder="Item 名字"
                  onChange={(e) => setItem(it.key, { name: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`删除 ${it.name || "这个 item"}`}
                  onClick={() => onChange({ ...draft, items: draft.items.filter((x) => x.key !== it.key) })}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg text-red-text active:bg-fill"
                >
                  <Trash2 className="size-[18px]" strokeWidth={1.75} />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3 pr-12">
                <label className="flex shrink-0 items-center gap-1.5 text-[13px] whitespace-nowrap text-label-2">
                  数量
                  <input
                    aria-label={`${it.name || "item"} 数量`}
                    inputMode="decimal"
                    className={cx(inputCls, "tabular w-14 px-1 text-center")}
                    value={it.qty}
                    onChange={(e) => setItem(it.key, { qty: e.target.value })}
                  />
                </label>
                <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] whitespace-nowrap text-label-2">
                  RM
                  <input
                    aria-label={`${it.name || "item"} 金额`}
                    inputMode="decimal"
                    className={cx(inputCls, "tabular w-full flex-1 text-right")}
                    value={it.amount}
                    placeholder="0.00"
                    onChange={(e) => setItem(it.key, { amount: e.target.value })}
                  />
                </label>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...draft, items: [...draft.items, { key: newKey(), name: "", qty: "1", amount: "" }] })}
          className="row flex h-11 w-full items-center gap-2 px-4 text-[15px] font-medium text-tint-text active:bg-fill"
        >
          <Plus className="size-[18px]" strokeWidth={2} /> 加 item
        </button>
      </Group>

      <Group
        title="Service charge / SST / rounding / 折扣"
        footer="不用知道税率：系统会用「总额 ÷ item 加起来」的倍数，把这些自动摊给每个人。"
      >
        {draft.charges.map((c) => (
          <div key={c.key} className="row px-4">
            <div className="row-sep flex items-center gap-2 border-b border-separator py-2.5">
              <input
                aria-label="名称"
                className={cx(inputCls, "w-full flex-1")}
                value={c.label}
                placeholder="例如 SST 6%"
                onChange={(e) => setCharge(c.key, { label: e.target.value })}
              />
              <input
                aria-label={`${c.label || "charge"} 金额`}
                inputMode="decimal"
                className={cx(inputCls, "tabular w-24 shrink-0 text-right")}
                value={c.amount}
                placeholder="0.00"
                onChange={(e) => setCharge(c.key, { amount: e.target.value })}
              />
              <button
                type="button"
                aria-label={`删除 ${c.label || "这一行"}`}
                onClick={() => onChange({ ...draft, charges: draft.charges.filter((x) => x.key !== c.key) })}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-red-text active:bg-fill"
              >
                <Trash2 className="size-[18px]" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...draft, charges: [...draft.charges, { key: newKey(), label: "", amount: "" }] })}
          className="row flex h-11 w-full items-center gap-2 px-4 text-[15px] font-medium text-tint-text active:bg-fill"
        >
          <Plus className="size-[18px]" strokeWidth={2} /> 加一行
        </button>
      </Group>

      <section className="mt-6">
        <Field
          label="总额（receipt 最后要付的数目）"
          inputMode="decimal"
          value={draft.total}
          placeholder="0.00"
          onChange={(e) => onChange({ ...draft, total: e.target.value })}
          className="[&_input]:tabular [&_input]:text-[20px] [&_input]:font-semibold"
        />
        <div className="tabular mt-3 space-y-1 px-1 text-[13px] leading-[18px] text-label-2">
          <p>
            Item {formatRM(parsed.itemsSum)} + charges {formatRM(parsed.chargesSum)} = {formatRM(parsed.itemsSum + parsed.chargesSum)}
          </p>
          {factor && (
            <p>
              倍数 ×{factor.toFixed(4)}：每 RM 1.00 的 item 要付 RM {factor.toFixed(2)}
            </p>
          )}
        </div>
        {showBalance &&
          (parsed.balanced ? (
            <p className="mt-3 flex items-center gap-1.5 px-1 text-[14px] leading-5 font-medium text-green-text">
              <Check className="size-4" strokeWidth={2.5} aria-hidden /> 加起来刚好等于总额
            </p>
          ) : (
            <div className="mt-3 rounded-xl bg-[color-mix(in_srgb,var(--red)_12%,transparent)] px-4 py-3">
              <p className="text-[14px] leading-5 font-semibold">加起来跟总额对不上，不能继续</p>
              <p className="tabular mt-1 text-[13px] leading-[18px] text-label-2">
                差 {formatRM(Math.abs(missing))}。先对着 receipt 看 item 和总额有没有读错；确定没错的话，补一行差额。
              </p>
              <Button variant="tinted" size="sm" className="mt-2" onClick={addBalancingLine}>
                补一行「{Math.abs(missing) <= 10 ? "Rounding" : "其他（差额）"}」{missing < 0 ? "−" : "+"}RM {centsToPlain(Math.abs(missing))}
              </Button>
            </div>
          ))}
      </section>

      {parsed.warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {parsed.warnings.map((w) => (
            <Notice key={w} tone="warn">
              {w}
            </Notice>
          ))}
        </div>
      )}
    </div>
  );
}
