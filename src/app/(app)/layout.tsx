import { redirect, unstable_rethrow } from "next/navigation";
import { currentUser, hasAnyUser } from "@/lib/server/auth";
import { TabBar } from "@/components/TabBar";
import { Toaster } from "@/components/ui-client";
import { SetupProblem } from "@/components/SetupProblem";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  try {
    const user = await currentUser();
    if (!user) {
      if (!(await hasAnyUser())) redirect("/setup");
      redirect("/login");
    }
  } catch (e) {
    unstable_rethrow(e); // redirect() 要让它通过
    return <SetupProblem error={e} />;
  }
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-[calc(104px+env(safe-area-inset-bottom))]">
      {children}
      <TabBar />
      <Toaster />
    </div>
  );
}
