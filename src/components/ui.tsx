// 不用 hooks 的基本组件（server / client 都能用）
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { formatRM } from "@/lib/money";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/**
 * 按钮全是胶囊形、全大写等宽字：
 * filled = 洋红主按钮；tinted = 黑色（深色模式变白）；ink = 永远黑色（放在黄色区块上）；
 * gray = 外框；gray-ink = 永远黑色外框（黄色区块上）；plain = 文字；danger = 红色外框
 */
export type Variant = "filled" | "tinted" | "ink" | "gray" | "gray-ink" | "plain" | "danger";

const variantClass: Record<Variant, string> = {
  filled: "bg-magenta text-white active:brightness-95",
  tinted: "bg-contrast text-on-contrast active:opacity-85",
  ink: "bg-ink text-white active:opacity-85",
  gray: "border-[1.5px] border-label text-label active:bg-fill",
  "gray-ink": "border-[1.5px] border-ink text-ink active:bg-black/5",
  plain: "text-label underline decoration-[1.5px] underline-offset-[5px] active:opacity-60",
  danger: "border-[1.5px] border-red-text text-red-text active:bg-fill",
};

export function buttonClass(variant: Variant = "gray", size: "md" | "lg" | "sm" = "md", full = false) {
  return cx(
    "press inline-flex items-center justify-center gap-2 rounded-full font-mono font-medium uppercase tracking-[0.05em] whitespace-nowrap transition-[transform,background-color,opacity] duration-150 select-none disabled:pointer-events-none disabled:opacity-35",
    size === "lg" && "h-14 px-7 text-[15px]",
    size === "md" && "h-12 px-5 text-[14px]",
    size === "sm" && "h-9 px-4 text-[12px]",
    variant === "plain" && "px-1",
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

/** 分组：等宽小标签 + 浅灰大圆角卡片 */
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
    <section className={cx("mt-8", className)}>
      {(title || action) && (
        <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
          <h2 className="label-mono text-label-2">{title}</h2>
          {action}
        </div>
      )}
      <div className="card list overflow-hidden rounded-[24px] bg-surface">{children}</div>
      {footer && <p className="mt-2.5 px-1 text-[12px] leading-[17px] text-label-2">{footer}</p>}
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
      {leading && <div className="flex shrink-0 items-center py-3 pr-3">{leading}</div>}
      <div className="row-sep flex min-h-[60px] min-w-0 flex-1 items-center gap-3 border-b border-separator py-3 pr-4">
        <div className="min-w-0 flex-1">{children}</div>
        {trailing && <div className="shrink-0 text-right">{trailing}</div>}
        {chevron && <ArrowRight aria-hidden className="size-4 shrink-0 text-label-3" strokeWidth={2} />}
      </div>
    </>
  );
  const cls = cx(
    "row flex w-full items-stretch pl-4 text-left transition-colors",
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

// 头像：每个人固定一个品牌色（按名字算），付钱的人 / 自己用黑色
const AVATAR_COLORS = [
  { bg: "var(--volt)", fg: "var(--ink)" },
  { bg: "var(--magenta)", fg: "#ffffff" },
  { bg: "var(--indigo)", fg: "#ffffff" },
  { bg: "var(--forest)", fg: "#ffffff" },
  { bg: "var(--flare)", fg: "var(--ink)" },
];

function nameHash(s: string): number {
  let h = 7;
  for (const ch of s.trim().toLowerCase()) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h;
}

export function Avatar({ name, size = 40, tint }: { name: string; size?: number; tint?: boolean }) {
  const ch = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  const c = tint ? { bg: "var(--contrast)", fg: "var(--on-contrast)" } : AVATAR_COLORS[nameHash(name) % AVATAR_COLORS.length];
  return (
    <span
      aria-hidden
      className="display inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46), letterSpacing: 0, background: c.bg, color: c.fg }}
    >
      {ch}
    </span>
  );
}

export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={cx("tabular whitespace-nowrap", className)}>{formatRM(cents)}</span>;
}

/** 大金额：超粗字，「RM」缩小 */
export function BigMoney({ cents, className }: { cents: number; className?: string }) {
  const neg = cents < 0;
  const num = formatRM(Math.abs(cents)).replace(/^RM\s*/, "");
  return (
    <span className={cx("display tabular inline-flex items-baseline whitespace-nowrap", className)}>
      {neg && "−"}
      <span className="mr-[0.14em] text-[0.4em] tracking-normal">RM</span>
      {num}
    </span>
  );
}

/** 小方 tag：等宽大写字 */
export type TagTone = "ink" | "volt" | "magenta" | "indigo" | "forest" | "flare" | "outline" | "mist";

const tagTone: Record<TagTone, string> = {
  ink: "bg-contrast text-on-contrast",
  volt: "bg-volt text-ink",
  magenta: "bg-magenta text-white",
  indigo: "bg-indigo text-white",
  forest: "bg-forest text-white",
  flare: "bg-flare text-ink",
  outline: "border border-label-3 text-label-2",
  mist: "bg-fill text-label-2",
};

export function Tag({ tone = "mist", children, className }: { tone?: TagTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-[22px] shrink-0 items-center gap-1 rounded-[4px] px-1.5 font-mono text-[11px] leading-none font-medium tracking-[0.04em] whitespace-nowrap uppercase",
        tagTone[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export type StatusKind = "payer" | "paid" | "forgot_tax" | "partial" | "unpaid" | "none";

export function StatusChip({ status, remaining }: { status: StatusKind; remaining?: number }) {
  const map: Record<StatusKind, { text: string; tone: TagTone | null }> = {
    payer: { text: "付钱的人", tone: "outline" },
    none: { text: "没有吃", tone: null },
    paid: { text: "已付 ✓", tone: "forest" },
    forgot_tax: { text: `忘了 tax · 差 ${formatRM(remaining ?? 0)}`, tone: "flare" },
    partial: { text: `还差 ${formatRM(remaining ?? 0)}`, tone: "volt" },
    unpaid: { text: "未付", tone: "ink" },
  };
  const m = map[status];
  if (!m.tone) return <span className="text-[13px] leading-[18px] text-label-3">{m.text}</span>;
  return <Tag tone={m.tone}>{m.text}</Tag>;
}

/** 页头：返回胶囊 + 超粗大标题 */
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
    <header className="px-4 pt-[max(8px,env(safe-area-inset-top))]">
      <div className="flex min-h-12 items-center justify-between gap-3 pt-1">
        {back ? (
          <Link
            href={back.href}
            className="press label-mono -ml-0.5 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface pr-4 pl-3 text-label active:bg-fill-2"
          >
            <ArrowLeft aria-hidden className="size-4" strokeWidth={2.25} />
            {back.label}
          </Link>
        ) : (
          <span />
        )}
        {action}
      </div>
      <h1 className="display mt-4 text-[40px] text-balance break-words">{title}</h1>
      {subtitle && <p className="mt-2.5 text-[15px] leading-[22px] text-label-2">{subtitle}</p>}
    </header>
  );
}

/** 黄色格线区块（首页、朋友 link、登入页的顶部） */
export function Hero({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("grid-lines on-color relative px-4 pb-8", className)}>{children}</section>;
}

/** 手画的波浪底线（只是装饰） */
export function Squiggle({ className, color = "var(--magenta)" }: { className?: string; color?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 240 14" preserveAspectRatio="none" className={cx("block h-3.5", className)} fill="none">
      <path
        d="M3 9.5c18-6 30-6 44 0s28 6 44-.5 30-6.5 46 0 30 6 46-.5 30-5.5 54-1"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const cls = {
    info: "bg-surface text-label",
    warn: "on-color bg-volt text-ink",
    error: "on-color bg-flare text-ink",
    ok: "on-color bg-forest text-white",
  }[tone];
  return <div className={cx("rounded-[16px] px-4 py-3.5 text-[14px] leading-5", cls)}>{children}</div>;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 text-label">{icon}</div>}
      <p className="display text-[28px] leading-[1.1]">{title}</p>
      {children && <div className="mt-2.5 max-w-xs text-[15px] leading-[22px] text-label-2">{children}</div>}
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
