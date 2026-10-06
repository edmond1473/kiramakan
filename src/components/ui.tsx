// 不用 hooks 的基本组件（server / client 都能用）
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatRM } from "@/lib/money";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "filled" | "tinted" | "gray" | "plain" | "danger";

const variantClass: Record<Variant, string> = {
  filled: "bg-tint-fill text-white active:brightness-90",
  tinted: "bg-tint-soft text-tint-text active:bg-fill-2",
  gray: "bg-fill text-label active:bg-fill-2",
  plain: "bg-transparent text-tint-text active:opacity-60",
  danger: "bg-fill text-red-text active:bg-fill-2",
};

export function buttonClass(variant: Variant = "gray", size: "md" | "lg" | "sm" = "md", full = false) {
  return cx(
    "press inline-flex items-center justify-center gap-1.5 rounded-[10px] font-semibold transition-[transform,background-color,opacity] duration-150 select-none disabled:opacity-40 disabled:pointer-events-none",
    size === "lg" && "h-12 px-5 text-[17px]",
    size === "md" && "h-11 px-4 text-[15px]",
    size === "sm" && "h-8 px-3 text-[13px] rounded-lg",
    full && "w-full",
    variantClass[variant],
  );
}

export function Button({
  variant = "gray",
  size = "md",
  full,
  loading,
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: "md" | "lg" | "sm"; full?: boolean; loading?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || loading} className={cx(buttonClass(variant, size, full), className)}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "gray",
  size = "md",
  full,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: "md" | "lg" | "sm";
  full?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cx(buttonClass(variant, size, full), className)}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

/** iOS Settings 式的分组列表 */
export function Group({
  title,
  footer,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  footer?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mt-6", className)}>
      {(title || action) && (
        <div className="mb-1.5 flex items-end justify-between px-4">
          <h2 className="text-[13px] leading-[18px] font-medium text-label-2">{title}</h2>
          {action}
        </div>
      )}
      <div className="list overflow-hidden rounded-xl bg-surface">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[12px] leading-4 text-label-2">{footer}</p>}
    </section>
  );
}

/** 列表行：分隔线从文字开始处画 */
export function Row({
  leading,
  children,
  trailing,
  href,
  onClick,
  chevron,
  className,
  selected,
  external,
}: {
  leading?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
  selected?: boolean;
  external?: boolean;
}) {
  const inner = (
    <>
      {leading && <div className="flex shrink-0 items-center py-2 pr-3">{leading}</div>}
      <div className="row-sep flex min-h-[44px] min-w-0 flex-1 items-center gap-3 border-b border-separator py-2.5 pr-4">
        <div className="min-w-0 flex-1">{children}</div>
        {trailing && <div className="shrink-0 text-right">{trailing}</div>}
        {chevron && <ChevronRight aria-hidden className="size-4 shrink-0 text-label-3" strokeWidth={2} />}
      </div>
    </>
  );
  const cls = cx(
    "row flex w-full items-stretch pl-4 text-left",
    (href || onClick) && "active:bg-fill",
    selected && "bg-tint-soft",
    className,
  );
  if (href && external)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {inner}
      </a>
    );
  if (href)
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  return <div className={cls}>{inner}</div>;
}

export function Avatar({ name, size = 36, tint }: { name: string; size?: number; tint?: boolean }) {
  const ch = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white")}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: tint ? "var(--tint-fill)" : "linear-gradient(180deg,#a5abb8,#858994)",
      }}
    >
      {ch}
    </span>
  );
}

export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={cx("tabular whitespace-nowrap", className)}>{formatRM(cents)}</span>;
}

export type StatusKind = "payer" | "paid" | "forgot_tax" | "partial" | "unpaid" | "none";

export function StatusChip({ status, remaining }: { status: StatusKind; remaining?: number }) {
  const map: Record<StatusKind, { text: string; cls: string; dot?: string }> = {
    payer: { text: "付钱的人", cls: "text-label-2" },
    none: { text: "没有吃", cls: "text-label-3" },
    paid: { text: "已付", cls: "text-green-text", dot: "var(--green)" },
    forgot_tax: {
      text: `忘了 tax · 差 ${formatRM(remaining ?? 0)}`,
      cls: "text-orange-text",
      dot: "var(--orange)",
    },
    partial: { text: `还差 ${formatRM(remaining ?? 0)}`, cls: "text-orange-text", dot: "var(--orange)" },
    unpaid: { text: "未付", cls: "text-red-text", dot: "var(--red)" },
  };
  const m = map[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[13px] leading-[18px] font-medium", m.cls)}>
      {m.dot && <span aria-hidden className="size-2 rounded-full" style={{ background: m.dot }} />}
      {m.text}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <header className="px-4 pt-3">
      <div className="flex h-11 items-center justify-between">
        {back ? (
          <Link href={back.href} className="-ml-2 flex items-center gap-0.5 rounded-lg px-1 py-2 text-tint-text active:opacity-60">
            <ChevronLeft aria-hidden className="size-6" strokeWidth={2} />
            <span className="text-[17px]">{back.label}</span>
          </Link>
        ) : (
          <span />
        )}
        {action}
      </div>
      <h1 className="mt-1 text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{title}</h1>
      {subtitle && <p className="mt-1 text-[15px] leading-[22px] text-label-2">{subtitle}</p>}
    </header>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const cls = {
    info: "bg-tint-soft text-label",
    warn: "bg-[color-mix(in_srgb,var(--orange)_14%,transparent)] text-label",
    error: "bg-[color-mix(in_srgb,var(--red)_12%,transparent)] text-label",
    ok: "bg-[color-mix(in_srgb,var(--green)_14%,transparent)] text-label",
  }[tone];
  return <div className={cx("rounded-xl px-4 py-3 text-[14px] leading-5", cls)}>{children}</div>;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      {icon && <div className="mb-3 text-label-3">{icon}</div>}
      <p className="text-[17px] leading-6 font-semibold">{title}</p>
      {children && <div className="mt-1 text-[14px] leading-5 text-label-2">{children}</div>}
    </div>
  );
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

export function formatDateShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]}`;
}

/** 马来西亚时间的今天（YYYY-MM-DD） */
export function todayMY(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}

export function daysSince(isoDate: string): number {
  const today = todayMY();
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+isoDate.slice(0, 4), +isoDate.slice(5, 7) - 1, +isoDate.slice(8, 10));
  return Math.max(0, Math.round((a - b) / 86400000));
}
