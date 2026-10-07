"use client";

import { AlertTriangle, Check, Plus, Trash2 } from "lucide-react";
import { centsToPlain, formatRM } from "@/lib/money";
import { newKey, parseDraft, type Draft, type DraftCharge, type DraftItem } from "@/lib/receipt";
import { Button, Group, Notice, cx } from "./ui";
import { Field } from "./ui-client";

const inputCls =
  "h-11 min-w-0 rounded-[12px] border-[1.5px] border-transparent bg-field px-3.5 text-[16px] text-label outline-none transition-colors placeholder:text-label-3 focus:border-label";

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
      <div className="mt-6 grid grid-cols-[1fr_auto] gap-2">
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
          className="w-[148px]"
        />
      </div>

      <Group title={`Item（${draft.items.length}）`}>
        {draft.items.map((it, idx) => (
          <div key={it.key} className={cx("row px-4", it.note && "on-color on-volt bg-volt")}>
            <div className={cx("row-sep border-b py-3.5", it.note ? "border-ink/10" : "border-separator")}>
              {it.note && (
                <p className="mb-2.5 flex items-start gap-2 text-[13px] leading-[18px] font-semibold">
                  <AlertTriangle className="mt-px size-4 shrink-0" strokeWidth={2.25} aria-hidden /> {it.note}，请对一下 receipt
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
                  className={cx(
                    "flex size-11 shrink-0 items-center justify-center rounded-full active:bg-fill",
                    it.note ? "text-ink" : "text-red-text",
                  )}
                >
                  <Trash2 className="size-[18px]" strokeWidth={2} />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3 pr-[52px]">
                <label className={cx("label-mono flex shrink-0 items-center gap-2 whitespace-nowrap", !it.note && "text-label-2")}>
                  数量
                  <input
                    aria-label={`${it.name || "item"} 数量`}
                    inputMode="decimal"
                    className={cx(inputCls, "tabular w-14 px-1 text-center font-sans tracking-normal normal-case")}
                    value={it.qty}
                    onChange={(e) => setItem(it.key, { qty: e.target.value })}
                  />
                </label>
                <label className={cx("label-mono flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap", !it.note && "text-label-2")}>
                  RM
                  <input
                    aria-label={`${it.name || "item"} 金额`}
                    inputMode="decimal"
                    className={cx(inputCls, "tabular w-full flex-1 text-right font-sans tracking-normal normal-case")}
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
          className="row label-mono flex h-14 w-full items-center gap-2 px-4 text-label active:bg-fill"
        >
          <Plus className="size-[18px]" strokeWidth={2.25} /> 加 item
        </button>
      </Group>

      <Group
        title="Service charge / SST / rounding / 折扣"
        footer="不用知道税率：系统会用「总额 ÷ item 加起来」的倍数，把这些自动摊给每个人。"
      >
        {draft.charges.map((c) => (
          <div key={c.key} className="row px-4">
            <div className="row-sep flex items-center gap-2 border-b border-separator py-3">
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
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-red-text active:bg-fill"
              >
                <Trash2 className="size-[18px]" strokeWidth={2} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...draft, charges: [...draft.charges, { key: newKey(), label: "", amount: "" }] })}
          className="row label-mono flex h-14 w-full items-center gap-2 px-4 text-label active:bg-fill"
        >
          <Plus className="size-[18px]" strokeWidth={2.25} /> 加一行
        </button>
      </Group>

      <section className="mt-8">
        <Field
          label="总额（receipt 最后要付的数目）"
          inputMode="decimal"
          value={draft.total}
          placeholder="0.00"
          onChange={(e) => onChange({ ...draft, total: e.target.value })}
          className="[&_input]:tabular [&_input]:h-14 [&_input]:text-[22px] [&_input]:font-semibold"
        />
        <div className="tabular mt-3 space-y-1 px-1 font-mono text-[12px] leading-[18px] tracking-[0.02em] text-label-2">
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
            <p className="on-color mt-4 flex items-center gap-2 rounded-full bg-forest py-3 pr-5 pl-4 text-[15px] leading-5 font-semibold text-white">
              <Check className="size-5" strokeWidth={3} aria-hidden /> 加起来刚好等于总额
            </p>
          ) : (
            <div className="on-color mt-4 rounded-[24px] bg-flare px-5 py-4 text-ink">
              <p className="display text-[22px] leading-[1.1]">加起来跟总额对不上，不能继续</p>
              <p className="tabular mt-2 text-[14px] leading-5">
                差 {formatRM(Math.abs(missing))}。先对着 receipt 看 item 和总额有没有读错；确定没错的话，补一行差额。
              </p>
              <Button variant="ink" full className="mt-4" onClick={addBalancingLine}>
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
