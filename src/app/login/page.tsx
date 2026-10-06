import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { currentUser, hasAnyUser } from "@/lib/server/auth";
import { AuthForm } from "@/components/AuthForm";
import { SetupProblem } from "@/components/SetupProblem";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "登入" };

export default async function LoginPage() {
  try {
    if (await currentUser()) redirect("/");
    if (!(await hasAnyUser())) redirect("/setup");
  } catch (e) {
    unstable_rethrow(e);
    return <SetupProblem error={e} />;
  }
  return (
    <main className="mx-auto max-w-sm px-4 pt-16 pb-12">
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">KiraMakan</h1>
      <p className="mt-2 text-[15px] leading-[22px] text-label-2">登入后可以新增账单、记录谁还了钱。</p>
      <AuthForm mode="login" />
    </main>
  );
}
