"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReceiptText, Settings, Users } from "lucide-react";
import { cx } from "./ui";

const tabs = [
  { href: "/", label: "账本", icon: ReceiptText, match: (p: string) => p === "/" || ["/bills", "/remind", "/inbox"].some((x) => p.startsWith(x)) },
  { href: "/people", label: "朋友", icon: Users, match: (p: string) => p.startsWith("/people") },
  { href: "/settings", label: "设定", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

/** 浮在底部的黑色胶囊 bar，现在这页用亮黄标出来 */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="主选单"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(14px,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex h-[60px] w-full max-w-[380px] items-center gap-1 rounded-full bg-ink p-1.5 dark:bg-surface-2 dark:ring-1 dark:ring-separator">
        {tabs.map((t) => {
          const active = t.match(pathname);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex h-full flex-1 items-center justify-center gap-1.5 rounded-full font-mono text-[13px] font-medium tracking-[0.05em] uppercase transition-colors",
                active ? "bg-volt text-ink" : "text-white/65 active:text-white",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={2} aria-hidden />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
