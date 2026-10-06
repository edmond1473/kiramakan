import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { hasAnyUser } from "@/lib/server/auth";
import { AuthForm } from "@/components/AuthForm";
import { SetupProblem } from "@/components/SetupProblem";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "第一次设定" };

export default async function SetupPage() {
  try {
    if (await hasAnyUser()) redirect("/login");
  } catch (e) {
    unstable_rethrow(e);
    return <SetupProblem error={e} />;
  }
  return (
    <main className="mx-auto max-w-sm px-4 pt-16 pb-12">
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">欢迎用 KiraMakan</h1>
      <p className="mt-2 text-[15px] leading-[22px] text-label-2">
        先建立你的帐号。之后可以在「设定」帮另一个常付钱的朋友开帐号。朋友们不用帐号，开 link 就能看。
      </p>
      <AuthForm mode="setup" />
    </main>
  );
}
