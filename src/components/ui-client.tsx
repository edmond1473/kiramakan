"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Minus, Plus, X } from "lucide-react";
import { cx } from "./ui";

// ---------- 只在浏览器才有的值（不用 useEffect + setState） ----------

const noopSubscribe = () => () => {};

/** 浏览器里才是 true；server render / hydration 时是 false */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** 网站的网址（例如 https://xxx.vercel.app），server render 时是空字符串 */
export function useOrigin(): string {
  return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
}

// ---------- Toast ----------

export function toast(message: string, tone: "ok" | "error" = "ok") {
  window.dispatchEvent(new CustomEvent("km-toast", { detail: { message, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; tone: "ok" | "error" }[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const { message, tone } = (e as CustomEvent).detail;
      const id = ++n;
      setItems((xs) => [...xs, { id, message, tone }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "error" ? 5000 : 2600);
    };
    window.addEventListener("km-toast", onToast);
    return () => window.removeEventListener("km-toast", onToast);
  }, []);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            "fade-in max-w-sm rounded-full px-4 py-2.5 text-[14px] leading-5 font-medium shadow-[var(--shadow-pop)]",
            t.tone === "error" ? "bg-surface text-red-text" : "bg-surface text-label",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ---------- Sheet（手机从底部滑出） ----------

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const mounted = useIsClient();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button aria-label="关闭" className="fade-in absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="sheet-in relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[20px] bg-bg shadow-[var(--shadow-sheet)] sm:rounded-[20px]">
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1.5 w-9 rounded-full bg-fill-2" />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 pt-2 pb-1">
          <h2 className="min-w-0 truncate text-[17px] leading-6 font-semibold">{title}</h2>
          <button
            aria-label="关闭"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fill text-label-2 active:bg-fill-2"
          >
            <X className="size-4" strokeWidth={2.25} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t border-separator px-4 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- 表单 ----------

export function Field({
  label,
  hint,
  error,
  className,
  ...rest
}: ComponentProps<"input"> & { label?: string; hint?: string; error?: string | null }) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="mb-1.5 block px-1 text-[13px] leading-[18px] font-medium text-label-2">{label}</span>}
      <input
        {...rest}
        className={cx(
          "h-11 w-full rounded-[10px] bg-surface px-3.5 text-[16px] text-label outline-none placeholder:text-label-3",
          "border focus:border-tint",
          error ? "border-red" : "border-separator",
        )}
      />
      {error ? (
        <span className="mt-1 block px-1 text-[12px] leading-4 text-red-text">{error}</span>
      ) : hint ? (
        <span className="mt-1 block px-1 text-[12px] leading-4 text-label-2">{hint}</span>
      ) : null}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-9 rounded-[9px] bg-fill p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-w-0 flex-1 truncate rounded-[7px] px-2 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-surface text-label shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:bg-[#636366]" : "text-label-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div className="inline-flex h-8 items-center rounded-lg bg-fill" aria-label={label}>
      <button
        aria-label={`${label} 减少`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="flex h-8 w-9 items-center justify-center text-label disabled:text-label-3"
      >
        <Minus className="size-4" strokeWidth={2.25} />
      </button>
      <span className="tabular w-6 text-center text-[15px] font-semibold">{value}</span>
      <button
        aria-label={`${label} 增加`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="flex h-8 w-9 items-center justify-center text-label disabled:text-label-3"
      >
        <Plus className="size-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 旧浏览器后备
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

export function CopyButton({
  text,
  label,
  done = "已复制",
  variant = "tinted",
  full,
}: {
  text: string;
  label: ReactNode;
  done?: string;
  variant?: "tinted" | "gray" | "filled";
  full?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const cls = {
    tinted: "bg-tint-soft text-tint-text",
    gray: "bg-fill text-label",
    filled: "bg-tint-fill text-white",
  }[variant];
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          timer.current = setTimeout(() => setCopied(false), 1800);
        } else toast("复制不了，请长按自己复制", "error");
      }}
      className={cx(
        "press inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] px-4 text-[15px] font-semibold",
        full && "w-full",
        cls,
      )}
    >
      {copied ? <Check className="size-4" strokeWidth={2.5} /> : <Copy className="size-4" strokeWidth={2} />}
      {copied ? done : label}
    </button>
  );
}
