import { TabBar } from "@/components/TabBar";
import { Toaster } from "@/components/ui-client";
import { PushSync } from "@/components/PushSync";

export const dynamic = "force-dynamic";

// 这里不等资料库检查登入：外框和骨架画面马上送出去，打开 app 不会先白屏。
// 每一页自己用 pageUser() 检查（没登入转去 /login，没有帐号的话登入页再转去 /setup）。
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-[calc(104px+env(safe-area-inset-bottom))]">
      {children}
      <TabBar />
      <Toaster />
      <PushSync />
    </div>
  );
}
