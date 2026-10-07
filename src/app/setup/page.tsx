import type { Metadata, Viewport } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { hasAnyUser } from "@/lib/server/auth";
import { AuthForm } from "@/components/AuthForm";
import { SetupProblem } from "@/components/SetupProblem";
import { AuthShell } from "@/components/AuthShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "第一次设定" };
export const viewport: Viewport = { themeColor: "#fff100" };

export default async function SetupPage() {
  try {
    if (await hasAnyUser()) redirect("/login");
  } catch (e) {
    unstable_rethrow(e);
    return <SetupProblem error={e} />;
  }
  return (
    <AuthShell
      eyebrow="第一次设定"
      title="欢迎用 KiraMakan"
      intro="先建立你的帐号。之后可以在「设定」帮另一个常付钱的朋友开帐号。朋友们不用帐号，开 link 就能看。"
    >
      <AuthForm mode="setup" />
    </AuthShell>
  );
}
