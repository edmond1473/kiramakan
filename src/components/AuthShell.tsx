import type { ReactNode } from "react";
import { Squiggle } from "./ui";

/** 登入 / 第一次设定：整页亮黄格线 + 超粗标题 + 白色表单卡 */
export function AuthShell({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <main className="grid-lines on-color min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col px-5 pt-[max(20px,env(safe-area-inset-top))] pb-10">
        <p className="label-mono pt-2">{eyebrow}</p>
        <div className="relative mt-14 self-start">
          <h1 className="display text-[60px] leading-[0.9] break-words">{title}</h1>
          <Squiggle className="mt-3 w-40" />
        </div>
        <p className="mt-6 text-[16px] leading-6">{intro}</p>
        <div className="mt-8 rounded-[32px] bg-bg p-6 text-label">{children}</div>
      </div>
    </main>
  );
}
