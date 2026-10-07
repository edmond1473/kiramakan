"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Minus, Plus, X } from "lucide-react";
import { buttonClass, cx, type Variant } from "./ui";

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
            "pop-in max-w-sm rounded-full px-5 py-3 text-[14px] leading-5 font-medium",
            t.tone === "error" ? "bg-flare text-ink" : "bg-contrast text-on-contrast",
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
    >
      <button aria-label="关闭" className="fade-in absolute inset-0 bg-[var(--scrim)]" onClick={onClose} />
      <div className="sheet-in relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[32px] bg-bg sm:rounded-[32px] dark:border-t dark:border-separator">
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-fill-2" />
        </div>
        <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-3">
          <h2 className="display min-w-0 pt-1 text-[26px] leading-[1.05] break-words">{title}</h2>
          <button
            aria-label="关闭"
            onClick={onClose}
            className="press flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-label active:bg-fill-2"
          >
            <X className="size-4" strokeWidth={2.5} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="pb-safe border-t border-separator px-5 pt-3">{footer}</div>}
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
      {label && <span className="label-mono mb-2 block px-1 text-label-2">{label}</span>}
      <input
        {...rest}
        className={cx(
          "h-12 w-full rounded-[12px] border-[1.5px] bg-field px-4 text-[16px] text-label outline-none transition-colors placeholder:text-label-3 focus:border-label",
          error ? "border-red" : "border-transparent",
        )}
      />
      {error ? (
        <span className="mt-1.5 block px-1 text-[12px] leading-4 text-red-text">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block px-1 text-[12px] leading-[17px] text-label-2">{hint}</span>
      ) : null}
    </label>
  );
}

/** 下拉选单：样子跟 Field 一样（宽度由外面决定，例如 w-full） */
export function selectClass(extra?: string) {
  return cx(
    "select-chevron h-12 rounded-[12px] border-[1.5px] border-transparent bg-field pr-10 pl-4 text-[16px] text-label outline-none focus:border-label",
    extra,
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
    <div role="radiogroup" aria-label={label} className="flex h-11 rounded-full bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-w-0 flex-1 truncate rounded-full px-3 font-mono text-[12px] font-medium tracking-[0.05em] uppercase transition-colors",
            value === o.value ? "bg-contrast text-on-contrast" : "text-label-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 黑色胶囊的 − 数字 + */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  tone = "contrast",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  /** ink = 永远黑色（放在亮黄的行上） */
  tone?: "contrast" | "ink";
}) {
  return (
    <div
      className={cx(
        "inline-flex h-9 shrink-0 items-center rounded-full",
        tone === "ink" ? "bg-ink text-white" : "bg-contrast text-on-contrast",
      )}
      aria-label={label}
    >
      <button
        aria-label={`${label} 减少`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30"
      >
        <Minus className="size-4" strokeWidth={2.5} />
      </button>
      <span className="display tabular w-5 text-center text-[17px] tracking-normal">{value}</span>
      <button
        aria-label={`${label} 增加`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30"
      >
        <Plus className="size-4" strokeWidth={2.5} />
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
  size = "md",
  full,
}: {
  text: string;
  label: ReactNode;
  done?: string;
  variant?: Variant;
  size?: "md" | "lg" | "sm";
  full?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          timer.current = setTimeout(() => setCopied(false), 1800);
        } else toast("复制不了，请长按自己复制", "error");
      }}
      className={buttonClass(variant, size, full)}
    >
      {copied ? <Check className="size-4" strokeWidth={2.75} /> : <Copy className="size-4" strokeWidth={2.25} />}
      {copied ? done : label}
    </button>
  );
}
