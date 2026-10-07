import type { Metadata, Viewport } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { currentUser, hasAnyUser } from "@/lib/server/auth";
import { AuthForm } from "@/components/AuthForm";
import { SetupProblem } from "@/components/SetupProblem";
import { AuthShell } from "@/components/AuthShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "登入" };
export const viewport: Viewport = { themeColor: "#fff100" };

export default async function LoginPage() {
  try {
    if (await currentUser()) redirect("/");
    if (!(await hasAnyUser())) redirect("/setup");
  } catch (e) {
    unstable_rethrow(e);
    return <SetupProblem error={e} />;
  }
  return (
    <AuthShell eyebrow="登入" title="KiraMakan" intro="拍 receipt、分 item、自动摊 tax。登入后可以新增账单、记录谁还了钱。">
      <AuthForm mode="login" />
    </AuthShell>
  );
}
