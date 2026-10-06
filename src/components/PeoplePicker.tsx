"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { cx } from "./ui";

/** 选谁有一起吃：点名字切换，可以直接打新名字加进去 */
export function PeoplePicker({
  people,
  selected,
  locked,
  onToggle,
  onAddName,
}: {
  people: { id: string; name: string }[];
  selected: Set<string>;
  locked?: Set<string>;
  onToggle: (id: string) => void;
  onAddName: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const add = () => {
    const n = name.trim();
    if (!n) return;
    onAddName(n);
    setName("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {people.map((p) => {
          const on = selected.has(p.id);
          const isLocked = locked?.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              disabled={isLocked}
              onClick={() => onToggle(p.id)}
              className={cx(
                "press inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium transition-colors",
                on ? "bg-tint-fill text-white" : "bg-surface text-label",
                isLocked && "opacity-80",
              )}
            >
              {on && <Check className="size-4" strokeWidth={2.5} />}
              {p.name}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="新朋友的名字"
          aria-label="新朋友的名字"
          className="h-11 min-w-0 flex-1 rounded-[10px] border border-separator bg-surface px-3.5 text-[16px] outline-none placeholder:text-label-3 focus:border-tint"
        />
        <button
          type="button"
          onClick={add}
          disabled={!name.trim()}
          className="press inline-flex h-11 items-center gap-1 rounded-[10px] bg-tint-soft px-4 text-[15px] font-semibold text-tint-text disabled:opacity-40"
        >
          <Plus className="size-4" strokeWidth={2.5} /> 加
        </button>
      </div>
    </div>
  );
}
