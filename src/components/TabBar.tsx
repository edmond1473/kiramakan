"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReceiptText, Settings, Users } from "lucide-react";
import { cx } from "./ui";

const tabs = [
  { href: "/", label: "账本", icon: ReceiptText, match: (p: string) => p === "/" || p.startsWith("/bills") },
  { href: "/people", label: "朋友", icon: Users, match: (p: string) => p.startsWith("/people") },
  { href: "/settings", label: "设定", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="主选单" className="material bottom-safe fixed inset-x-0 z-40 border-t border-separator">
      <div className="mx-auto flex h-[52px] max-w-lg">
        {tabs.map((t) => {
          const active = t.match(pathname);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] leading-[14px] font-medium",
                active ? "text-tint" : "text-label-2",
              )}
            >
              <Icon className="size-6" strokeWidth={1.75} aria-hidden />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
